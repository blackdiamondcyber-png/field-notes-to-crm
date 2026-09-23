"""Live eval runner: uv run python -m fieldnotes.eval --prompt v2 [--limit N] [--no-cache]

Runs extract_activity over the dataset (or the first --limit N records),
writes results/python-<v>.json (gitignored), and prints the summary table.
Never writes to results/v1.json, results/v2.json, or results/baseline.json -
those are the committed TypeScript references this module is checked
against, not outputs of this module.
"""

from __future__ import annotations

import argparse
import json

from fieldnotes import REPO_ROOT
from fieldnotes.extract import PromptVersion, extract_activity
from fieldnotes.summarize import EvalSummary, UsageRow, summarize, summary_table
from fieldnotes.types import NoteRecord


def load_dataset() -> list[NoteRecord]:
    path = REPO_ROOT / "data" / "notes.jsonl"
    records: list[NoteRecord] = []
    with path.open(encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if line == "":
                continue
            records.append(json.loads(line))
    return records


def run_eval(
    prompt_version: PromptVersion,
    records: list[NoteRecord],
    use_cache: bool,
) -> EvalSummary:
    rows: list[UsageRow] = []
    failures: list[str] = []
    for record in records:
        try:
            result = extract_activity(
                record["note"],
                record["noted_at"],
                prompt_version,
                use_cache=use_cache,
            )
        except Exception as error:  # matches src/eval.ts's per-record catch
            failures.append(f"{record['id']}: {error}")
            continue
        rows.append(
            {
                "predicted": result["activity"],
                "label": record["label"],
                "inputTokens": result["inputTokens"],
                "outputTokens": result["outputTokens"],
                "latencyMs": result["latencyMs"],
            }
        )
    return summarize(prompt_version, rows, failures)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m fieldnotes.eval")
    parser.add_argument("--prompt", choices=["v1", "v2"], required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--no-cache", action="store_true")
    args = parser.parse_args(argv)
    prompt_version: PromptVersion = args.prompt

    records = load_dataset()
    if args.limit is not None:
        records = records[: args.limit]

    summary = run_eval(prompt_version, records, use_cache=not args.no_cache)

    output_dir = REPO_ROOT / "results"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"python-{prompt_version}.json"
    output_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(
        f"Eval complete for {prompt_version} ({len(records)} records, "
        f"{len(summary['failures'])} failures). Wrote "
        f"results/python-{prompt_version}.json"
    )
    print(summary_table(summary))

    return 1 if summary["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
