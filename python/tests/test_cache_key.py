"""Checks fieldnotes.extract.cache_key against the shared .cache/ directory
and against a hard-coded expected hash, so the test also runs in CI where
.cache/ does not exist (it is gitignored)."""

from __future__ import annotations

import json

import pytest

from fieldnotes import REPO_ROOT
from fieldnotes.extract import cache_key
from fieldnotes.types import NoteRecord

# Computed once locally with cache_key("v2", <first note in data/notes.jsonl>)
# and cross-checked against src/lib/cache.ts's cacheKey("v2", note) via tsx -
# both produced this exact hex string, which is also the filename of an
# existing entry in .cache/. Pasted here so this test still runs in CI,
# where .cache/ does not exist.
EXPECTED_HEX_FOR_FIRST_NOTE_V2 = "3895d258190e7bb89a33a77157bb7d271c1a607d47086e61343f55c9b7270827"


def _first_note() -> str:
    dataset_path = REPO_ROOT / "data" / "notes.jsonl"
    with dataset_path.open(encoding="utf-8") as handle:
        first_line = handle.readline()
    record: NoteRecord = json.loads(first_line)
    return record["note"]


def test_cache_key_matches_hard_coded_expected_hash() -> None:
    assert cache_key("v2", _first_note()) == EXPECTED_HEX_FOR_FIRST_NOTE_V2


def test_cache_key_matches_an_existing_cache_file_when_cache_exists() -> None:
    cache_dir = REPO_ROOT / ".cache"
    if not cache_dir.exists():
        pytest.skip(".cache/ does not exist (expected in CI - it is gitignored)")
    key = cache_key("v2", _first_note())
    assert (cache_dir / f"{key}.json").exists()
