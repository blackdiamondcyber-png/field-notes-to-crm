"""Offline scorer: uv run python -m fieldnotes.score --prompt v1|v2 [--check]

Loads the dataset and data/predictions/<v>.jsonl, joins by id in dataset
order, and calls the same summarize() the live eval uses - zero API calls.
With --check, compares the result against results/<v>.json field by field
and exits 1 on any difference.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import TypedDict, cast

from fieldnotes import REPO_ROOT
from fieldnotes.extract import PromptVersion
from fieldnotes.summarize import EvalSummary, UsageRow, summarize, summary_table
from fieldnotes.types import ActivityRecord, NoteRecord


class PredictionLine(TypedDict):
    id: str
    prompt_version: PromptVersion
    predicted: ActivityRecord
    input_tokens: int
    output_tokens: int
    latency_ms: float


def load_dataset(repo_root: Path = REPO_ROOT) -> list[NoteRecord]:
    path = repo_root / "data" / "notes.jsonl"
    records: list[NoteRecord] = []
    with path.open(encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if line == "":
                continue
            records.append(json.loads(line))
    return records


def load_predictions(
    prompt_version: PromptVersion, repo_root: Path = REPO_ROOT
) -> dict[str, PredictionLine]:
    path = repo_root / "data" / "predictions" / f"{prompt_version}.jsonl"
    by_id: dict[str, PredictionLine] = {}
    with path.open(encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if line == "":
                continue
            parsed: PredictionLine = json.loads(line)
            by_id[parsed["id"]] = parsed
    return by_id


def build_rows(
    records: list[NoteRecord],
    predictions: dict[str, PredictionLine],
    prompt_version: PromptVersion,
) -> list[UsageRow]:
    rows: list[UsageRow] = []
    for record in records:
        prediction = predictions.get(record["id"])
        if prediction is None:
            raise SystemExit(
                f"No prediction for {record['id']} in data/predictions/{prompt_version}.jsonl"
            )
        rows.append(
            {
                "predicted": prediction["predicted"],
                "label": record["label"],
                "inputTokens": prediction["input_tokens"],
                "outputTokens": prediction["output_tokens"],
                "latencyMs": prediction["latency_ms"],
            }
        )
    return rows


def diff_fields(actual: EvalSummary, expected: EvalSummary) -> list[str]:
    actual_dict = cast(dict[str, object], actual)
    expected_dict = cast(dict[str, object], expected)
    diffs: list[str] = []
    for key, expected_value in expected_dict.items():
        actual_value = actual_dict.get(key)
        if actual_value != expected_value:
            diffs.append(
                f"{key}: expected {json.dumps(expected_value)}, got {json.dumps(actual_value)}"
            )
    return diffs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m fieldnotes.score")
    parser.add_argument("--prompt", choices=["v1", "v2"], required=True)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    prompt_version: PromptVersion = args.prompt

    records = load_dataset()
    predictions = load_predictions(prompt_version)
    rows = build_rows(records, predictions, prompt_version)

    summary = summarize(prompt_version, rows, [])

    print(f"Scored {prompt_version} from data/predictions/{prompt_version}.jsonl (no API calls)")
    print(summary_table(summary))

    if args.check:
        results_path = REPO_ROOT / "results" / f"{prompt_version}.json"
        expected: EvalSummary = json.loads(results_path.read_text(encoding="utf-8"))
        diffs = diff_fields(summary, expected)
        if diffs:
            print(f"\nMISMATCH vs results/{prompt_version}.json:", file=sys.stderr)
            for diff in diffs:
                print(f"  {diff}", file=sys.stderr)
            return 1
        print(f"\nMatches results/{prompt_version}.json exactly.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
