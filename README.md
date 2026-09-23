# field-notes-to-crm

[![CI](https://github.com/blackdiamondcyber-png/field-notes-to-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/blackdiamondcyber-png/field-notes-to-crm/actions/workflows/ci.yml)

I am a dental equipment sales rep and I dictate my visit notes on my phone between stops. They come out messy: filler words, typos, relative dates like "next Tues" or "end of month," sometimes two offices in one note, sometimes just a phone tag with nobody home. I built the CRM I use myself, and the piece I kept getting wrong by hand was turning that messy dictation into a clean activity row. This project is that extraction step, plus an eval harness so I can change the prompt and actually measure whether it got better instead of guessing.

A two and a half minute walkthrough of the dataset, the results and the regression the harness caught is on YouTube: [building the eval before shipping the prompt](https://www.youtube.com/watch?v=46dHjUNHqIU).

## The table

The target shape is the real table in my CRM:

```sql
activities(
  office_id,
  activity_type CHECK IN ('call', 'email', 'visit', 'note', 'demo', 'quote'),
  notes TEXT,
  next_action TEXT,
  next_action_date DATE
)
```

## The extraction schema

Given one note and the date it was dictated (`noted_at`), the model calls a single tool, `record_activity`, with:

```ts
{
  office_name: string;
  activity_type: "call" | "email" | "visit" | "note" | "demo" | "quote";
  contacts: string[];          // people named in the note
  products_mentioned: string[];
  outcome: string;             // one sentence
  next_action: string | null;
  next_action_date: string | null; // ISO date, resolved from relative phrases against noted_at
  follow_up_needed: boolean;
  confidence: "high" | "medium" | "low";
}
```

`office_name` and `activity_type` map straight onto the table; `contacts`, `products_mentioned`, `outcome`, and `confidence` fold into the `notes` text when the row is actually written to the CRM (that write path is not part of this repo, see "What this is not").

## The dataset

`data/notes.jsonl` has 150 records, each `{ id, noted_at, note, label }`. It is built by `scripts/make-dataset.ts` and is fully deterministic (seeded PRNG, so running the script twice produces byte-identical output, which `test/make-dataset.test.ts` checks).

- **120 templated records.** Generated from templates with varied phrasing, filler words, occasional typos, mixed activity types, relative dates, and sometimes no next action at all. Because the label for each of these records is built from the exact same template parameters that produced the note text (the office name, activity type, products, and resolved date all come from one function call), the labels are **exact by construction**. The parameters become the label directly, with no model and no human transcription step in between. The only shared logic between note generation and labeling is `src/lib/dates.ts`, which is unit tested on its own.
- **30 hand-written hard cases**, authored directly in `scripts/make-dataset.ts` as literal note/label pairs: two offices in one note, a cancelled visit, a pure phone-tag note, a product mentioned but never actually discussed, a sarcastic note, a signed quote with no follow-up, and several dates that cross month or year boundaries. These are exact by construction too, in the more direct sense that I wrote both the note and its label by hand at the same time.

Office and contact names are fictional.

## Prompts

Two versions live in `src/prompts/`:

- **v1** (`v1.ts`) is a naive one-paragraph instruction. Left deliberately underspecified.
- **v2** (`v2.ts`) writes the rules down: an activity-type precedence order for notes that touch more than one kind of interaction, how to resolve relative dates against `noted_at`, exactly when `next_action` must be null versus populated-but-undated, and a hard rule against inventing products or people.

## Running it

```bash
pnpm install
pnpm make-dataset   # regenerate data/notes.jsonl (deterministic, no API calls)
pnpm build          # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest

# requires ANTHROPIC_API_KEY in the environment
pnpm extract "Stopped by Maplewood, talked to Dr. Nair, she wants a quote by next Tuesday" --date 2026-03-12
pnpm eval --prompt v1
pnpm eval --prompt v2
pnpm eval --gate      # exits 1 if any headline metric drops more than 2 points vs results/baseline.json
pnpm eval --promote   # copies the current run to results/baseline.json
```

`ANTHROPIC_API_KEY` is read from `process.env` only. It is never printed or committed, and `.env*` is gitignored. Responses are cached in `.cache/` keyed by `sha256(promptVersion + note)`, so re-running the eval after a code change (not a prompt change) costs nothing.

## Results

Both runs are 150 notes through `claude-sonnet-5`, tool use with a strict schema, on the dataset in this repo. No records failed.

| Metric                               | v1, naive prompt | v2, explicit rules |
| ------------------------------------ | ---------------: | -----------------: |
| Activity type accuracy               |            94.0% |              85.3% |
| next_action_date exact match         |            90.7% |              90.0% |
| next_action null handling            |            81.3% |              88.0% |
| products_mentioned F1                |            83.3% |              88.7% |
| contacts F1                          |            63.3% |              99.7% |
| office_name exact match              |           100.0% |             100.0% |
| Hallucination rate (lower is better) |            19.3% |              12.0% |
| Mean latency                         |          3621 ms |            3331 ms |
| Estimated cost for the run           |            $0.77 |              $1.04 |

## Reproduce every number without an API key

The 300 model outputs behind the table above are committed in `data/predictions/` (`v1.jsonl` and `v2.jsonl`), one line per note, exported straight from the same cache the eval reads. You do not need an API key to check the table:

```bash
pnpm score --prompt v1 --check
pnpm score --prompt v2 --check

cd python
uv run python -m fieldnotes.score --prompt v1 --check
uv run python -m fieldnotes.score --prompt v2 --check
```

Each command recomputes the whole table from the committed predictions and exits 1 if a single number differs from `results/v1.json` or `results/v2.json`. CI runs both the TypeScript and Python versions on every push (`pnpm test`, which includes `test/reproduce.test.ts`, and the `python` job in `.github/workflows/ci.yml`), so the published numbers are checked continuously instead of only when I remember to run them by hand. Only the `eval-gate` job that re-runs the model against the baseline needs `ANTHROPIC_API_KEY`.

There are two implementations on purpose. `python/` is a second, independent scorer, written from `src/lib/metrics.ts` and `src/summarize.ts` field by field, that reproduces `results/v1.json` and `results/v2.json` bit for bit from the same committed predictions. That is the actual test: if the scoring rules were vague or under-specified anywhere, the two implementations would drift apart on at least one field. They do not.

## Python

A second, independent implementation of the scoring lives in `python/`, managed with [uv](https://docs.astral.sh/uv/). It has no dependency on the TypeScript code or its `node_modules`, and shares only the committed data files: `data/notes.jsonl`, `data/predictions/`, and `results/`.

```bash
cd python
uv sync                        # pytest, ruff, mypy - no API dependency
uv run ruff check
uv run ruff format --check
uv run mypy --strict src tests
uv run pytest -q

uv run python -m fieldnotes.score --prompt v2 --check   # same check as pnpm score, zero API calls

# requires ANTHROPIC_API_KEY, as an env var or in .env.local at the repo root
uv sync --extra live            # installs the anthropic SDK
uv run python -m fieldnotes.eval --prompt v2 --limit 3
```

`fieldnotes.extract` sends the same request `src/extract.ts` does: same model, same tool schema, same cache key, so the two runners share one `.cache/` directory. `fieldnotes.eval` only ever writes `results/python-<v>.json`, which is gitignored; it never touches `results/v1.json`, `results/v2.json`, or `results/baseline.json`.

## What the eval caught

**A bug in the eval itself, before it caught anything about the prompt.** The first run scored products_mentioned at 50.7% and 50.0%, which was suspiciously flat across two very different prompts. Comparing the cached predictions to the labels by hand showed zero mismatches on that field. The set metric was scoring an empty prediction against an empty label as zero instead of as a correct answer, and 62 of the 150 notes (41%) mention no product at all. Fixed in `src/lib/metrics.ts` with two tests. The corrected numbers are the ones in the table, and they are 30 points higher for both prompts. A metric that cannot tell two prompts apart is worth more suspicion than a metric that says something you dislike.

**v2's contact rule worked.** Writing down that a contact is "role plus name" when the note gives one, and that nothing may be invented, took contacts F1 from 63.3% to 99.7% and cut the hallucination rate from 19.3% to 12.0%.

**v2's activity type rule backfired.** Accuracy dropped from 94.0% to 85.3%: 15 notes got worse, 2 got better. Eight of the fifteen were emails that mentioned an attached quote, and the precedence line "quote > demo > visit > call > email > note" pushed the model to label them `quote`. The precedence rule was written for notes where two things genuinely happened, and it is being applied to the subject of a sentence instead. The rule needs to say that activity_type is the medium of the interaction, and that a quote only wins when the quote itself was the interaction. That is a v3, and the harness is what makes it a measurable change rather than an argument.

## What this is not

This is a standalone evaluation harness for one extraction step, not the production CRM. The production CRM does not run a model at all. It is a plain Postgres table with a normal web form. This repository exists so that the prompt behind the "turn a dictated note into a row" feature can be changed and measured with real numbers, on a fixed dataset, before that prompt is trusted anywhere near a live database write.

## License

MIT, see [LICENSE](./LICENSE).

More of my work: [erik-pearson-portfolio.vercel.app](https://erik-pearson-portfolio.vercel.app). Contact: [LinkedIn](https://www.linkedin.com/in/erikpearson2).
