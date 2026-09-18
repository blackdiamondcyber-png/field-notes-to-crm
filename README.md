# field-notes-to-crm

I am a dental equipment sales rep and I dictate my visit notes on my phone between stops. They come out messy: filler words, typos, relative dates like "next Tues" or "end of month," sometimes two offices in one note, sometimes just a phone tag with nobody home. I built the CRM I use myself, and the piece I kept getting wrong by hand was turning that messy dictation into a clean activity row. This project is that extraction step, plus an eval harness so I can change the prompt and actually measure whether it got better instead of guessing.

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

`office_name` and `activity_type` map straight onto the table; `contacts`, `products_mentioned`, `outcome`, and `confidence` fold into the `notes` text when the row is actually written to the CRM (that write path is not part of this repo - see "What this is not").

## The dataset

`data/notes.jsonl` has 150 records, each `{ id, noted_at, note, label }`. It is built by `scripts/make-dataset.ts` and is fully deterministic (seeded PRNG - running the script twice produces byte-identical output, which `test/make-dataset.test.ts` checks).

- **120 templated records.** Generated from templates with varied phrasing, filler words, occasional typos, mixed activity types, relative dates, and sometimes no next action at all. Because the label for each of these records is built from the exact same template parameters that produced the note text (the office name, activity type, products, and resolved date all come from one function call), the labels are **exact by construction** - there is no model, and no human transcription step, between the parameters and the label. The only shared logic between note generation and labeling is `src/lib/dates.ts`, which is unit tested on its own.
- **30 hand-written hard cases**, authored directly in `scripts/make-dataset.ts` as literal note/label pairs: two offices in one note, a cancelled visit, a pure phone-tag note, a product mentioned but never actually discussed, a sarcastic note, a signed quote with no follow-up, and several dates that cross month or year boundaries. These are exact by construction too, in the more direct sense that I wrote both the note and its label by hand at the same time.

Office and contact names are fictional.

## Prompts

Two versions live in `src/prompts/`:

- **v1** (`v1.ts`) - a naive one-paragraph instruction. Left deliberately underspecified.
- **v2** (`v2.ts`) - explicit rules: an activity-type precedence order for notes that touch more than one kind of interaction, how to resolve relative dates against `noted_at`, exactly when `next_action` must be null versus populated-but-undated, and a hard rule against inventing products or people.

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

`ANTHROPIC_API_KEY` is read from `process.env` only - it is never printed or committed, and `.env*` is gitignored. Responses are cached in `.cache/` keyed by `sha256(promptVersion + note)`, so re-running the eval after a code change (not a prompt change) costs nothing.

## Results

_Placeholder - fill in after running `pnpm eval --prompt v1` and `pnpm eval --prompt v2` with a real API key. `pnpm eval` writes this exact table to `results/report.md`; paste it here once both runs exist._

| Metric                             | v1  | v2  |
| ---------------------------------- | --- | --- |
| Activity type accuracy             | TBD | TBD |
| next_action_date exact match       | TBD | TBD |
| next_action null-handling accuracy | TBD | TBD |
| products_mentioned F1              | TBD | TBD |
| contacts F1                        | TBD | TBD |
| office_name exact match            | TBD | TBD |
| Hallucination rate                 | TBD | TBD |
| Mean latency                       | TBD | TBD |
| Estimated cost                     | TBD | TBD |

## What the eval caught between v1 and v2

_Placeholder - fill in after the first real run. Expect this section to name specific failure modes v1 hit on the hard cases (e.g. picking the wrong activity_type on a visit-plus-demo note, hallucinating a next_action_date from "after the holiday," or inventing a product that was only mentioned in passing) and confirm whether v2's explicit rules actually fixed them._

## What this is not

This is a standalone evaluation harness for one extraction step, not the production CRM. The production CRM does not run a model at all - it is a plain Postgres table with a normal web form. This repository exists so that the prompt behind the "turn a dictated note into a row" feature can be changed and measured with real numbers, on a fixed dataset, before that prompt is trusted anywhere near a live database write.

## License

MIT, see [LICENSE](./LICENSE).
