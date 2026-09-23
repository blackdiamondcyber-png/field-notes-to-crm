"""For v1 and v2, recomputes the summary from ../data/notes.jsonl and
../data/predictions/<v>.jsonl and asserts exact equality against
../results/<v>.json on every field. Paths resolve against the repo root
(fieldnotes.REPO_ROOT), not the process cwd, so this passes whether pytest
is invoked from python/ or from the repo root."""

from __future__ import annotations

import json
from typing import cast

import pytest

from fieldnotes import REPO_ROOT
from fieldnotes.extract import PromptVersion
from fieldnotes.score import build_rows, load_dataset, load_predictions
from fieldnotes.summarize import EvalSummary, summarize


@pytest.mark.parametrize("raw_version", ["v1", "v2"])
def test_summarize_reproduces_committed_results_exactly(raw_version: str) -> None:
    prompt_version = cast(PromptVersion, raw_version)

    records = load_dataset()
    predictions = load_predictions(prompt_version)
    rows = build_rows(records, predictions, prompt_version)

    summary = summarize(prompt_version, rows, [])
    expected: EvalSummary = json.loads(
        (REPO_ROOT / "results" / f"{prompt_version}.json").read_text(encoding="utf-8")
    )

    assert summary["failures"] == []
    assert expected["failures"] == []

    # Exact equality on every field, not just failures. If any float
    # differs, that is a real operation-order bug to fix, not a reason to
    # switch this to an approximate comparison.
    assert summary == expected
