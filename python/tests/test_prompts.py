"""Checks that fieldnotes.prompts is byte-for-byte identical to the
TypeScript source it was copied from, by extracting the template literal
straight out of src/prompts/v1.ts and v2.ts."""

from __future__ import annotations

import re
from pathlib import Path

from fieldnotes import REPO_ROOT
from fieldnotes.prompts import V1_PROMPT, V2_PROMPT

_TEMPLATE_LITERAL_RE = re.compile(r"SYSTEM_PROMPT\s*=\s*`(.*?)`;", re.DOTALL)


def _extract_system_prompt(ts_path: Path) -> str:
    text = ts_path.read_text(encoding="utf-8")
    match = _TEMPLATE_LITERAL_RE.search(text)
    if match is None:
        raise AssertionError(f"No SYSTEM_PROMPT template literal found in {ts_path}")
    return match.group(1)


def test_v1_prompt_matches_typescript_source_byte_for_byte() -> None:
    ts_text = _extract_system_prompt(REPO_ROOT / "src" / "prompts" / "v1.ts")
    assert ts_text == V1_PROMPT


def test_v2_prompt_matches_typescript_source_byte_for_byte() -> None:
    ts_text = _extract_system_prompt(REPO_ROOT / "src" / "prompts" / "v2.ts")
    assert ts_text == V2_PROMPT
