"""Live runner: calls the Claude API and mirrors src/extract.ts exactly
(same model, request shape, tool schema, and cache format), so the Python
and TypeScript runners can share one .cache/ directory.

The anthropic package is an optional dependency (the "live" extra) so that
importing this module for its constants (PromptVersion, PRICE_PER_MILLION_*)
never requires it - only extract_activity() does, and it imports anthropic
lazily, right before it is needed.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Any, Literal, TypedDict, TypeGuard, cast

from fieldnotes import REPO_ROOT
from fieldnotes.prompts import V1_PROMPT, V2_PROMPT
from fieldnotes.types import ACTIVITY_TYPES, ActivityRecord

PromptVersion = Literal["v1", "v2"]

MODEL_ID = "claude-sonnet-5"

# $/1M tokens, from the claude-api skill's pricing table for claude-sonnet-5.
# Same constants as src/extract.ts - keep them in sync.
PRICE_PER_MILLION_INPUT = 2.0
PRICE_PER_MILLION_OUTPUT = 10.0

TOOL_NAME = "record_activity"

TOOL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "office_name",
        "activity_type",
        "contacts",
        "products_mentioned",
        "outcome",
        "next_action",
        "next_action_date",
        "follow_up_needed",
        "confidence",
    ],
    "properties": {
        "office_name": {"type": "string"},
        "activity_type": {"type": "string", "enum": list(ACTIVITY_TYPES)},
        "contacts": {"type": "array", "items": {"type": "string"}},
        "products_mentioned": {"type": "array", "items": {"type": "string"}},
        "outcome": {"type": "string"},
        "next_action": {"type": ["string", "null"]},
        "next_action_date": {"type": ["string", "null"]},
        "follow_up_needed": {"type": "boolean"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    },
}

CACHE_DIR = REPO_ROOT / ".cache"


class CachedResult(TypedDict):
    activity: ActivityRecord
    inputTokens: int
    outputTokens: int
    latencyMs: float


class ExtractResult(TypedDict):
    activity: ActivityRecord
    inputTokens: int
    outputTokens: int
    latencyMs: float
    cached: bool


def _prompt_for(version: PromptVersion) -> str:
    return V1_PROMPT if version == "v1" else V2_PROMPT


def cache_key(prompt_version: str, note: str) -> str:
    """Same derivation as src/lib/cache.ts's cacheKey: sha256 of
    "{version}::{note}", hex-encoded. Keep these in sync - it is what lets
    the TS and Python runners share one .cache/ directory."""
    digest = hashlib.sha256(f"{prompt_version}::{note}".encode())
    return digest.hexdigest()


def _cache_path(prompt_version: str, note: str) -> Path:
    return CACHE_DIR / f"{cache_key(prompt_version, note)}.json"


def _read_cache(prompt_version: str, note: str) -> CachedResult | None:
    path = _cache_path(prompt_version, note)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return cast(CachedResult, data)


def _write_cache(prompt_version: str, note: str, result: CachedResult) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(prompt_version, note)
    path.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")


def _load_dotenv_local() -> None:
    """Tiny KEY=VALUE parser for .env.local at the repo root. Never prints
    or logs anything it reads - only sets process environment variables."""
    path = REPO_ROOT / ".env.local"
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def _ensure_api_key() -> None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    _load_dotenv_local()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set in the environment and was not "
            "found in .env.local at the repo root. Set one of them and "
            "try again."
        )


_client: Any = None


def _get_client() -> Any:
    global _client
    if _client is None:
        _ensure_api_key()
        import anthropic

        _client = anthropic.Anthropic()
    return _client


def is_activity_record(value: object) -> TypeGuard[ActivityRecord]:
    if not isinstance(value, dict):
        return False
    v = cast(dict[str, object], value)
    activity_type = v.get("activity_type")
    confidence = v.get("confidence")
    next_action = v.get("next_action")
    next_action_date = v.get("next_action_date")
    return (
        isinstance(v.get("office_name"), str)
        and isinstance(activity_type, str)
        and activity_type in ACTIVITY_TYPES
        and isinstance(v.get("contacts"), list)
        and isinstance(v.get("products_mentioned"), list)
        and isinstance(v.get("outcome"), str)
        and (next_action is None or isinstance(next_action, str))
        and (next_action_date is None or isinstance(next_action_date, str))
        and isinstance(v.get("follow_up_needed"), bool)
        and (confidence in ("high", "medium", "low"))
    )


def extract_activity(
    note: str,
    noted_at: str,
    prompt_version: PromptVersion,
    *,
    use_cache: bool = True,
) -> ExtractResult:
    """Extracts a structured CRM activity record from one field note using
    the given prompt version. Mirrors src/extract.ts's extractActivity().

    When use_cache is True (the default), a cache hit short-circuits the
    live call entirely - this is what makes `--limit 3` with a warm cache
    make zero API calls. When use_cache is False, the cache is bypassed on
    both read and write, so a --no-cache run neither reads nor overwrites
    the shared .cache/ entries.
    """
    if use_cache:
        cached = _read_cache(prompt_version, note)
        if cached is not None:
            return {
                "activity": cached["activity"],
                "inputTokens": cached["inputTokens"],
                "outputTokens": cached["outputTokens"],
                "latencyMs": cached["latencyMs"],
                "cached": True,
            }

    client = _get_client()
    system = f"{_prompt_for(prompt_version)}\n\nThe note's noted_at date is {noted_at}."

    start = time.perf_counter()
    response = client.messages.create(
        model=MODEL_ID,
        max_tokens=1024,
        system=system,
        thinking={"type": "disabled"},
        output_config={"effort": "low"},
        tools=[
            {
                "name": TOOL_NAME,
                "description": ("Record one structured CRM activity extracted from a field note."),
                "input_schema": TOOL_SCHEMA,
                "strict": True,
            }
        ],
        tool_choice={"type": "tool", "name": TOOL_NAME},
        messages=[{"role": "user", "content": note}],
    )
    latency_ms = (time.perf_counter() - start) * 1000

    tool_use_block = None
    for block in response.content:
        if block.type == "tool_use":
            tool_use_block = block
            break
    if tool_use_block is None:
        raise RuntimeError(f"No tool_use block in response for note: {note[:60]}...")

    tool_input: object = tool_use_block.input
    if not is_activity_record(tool_input):
        raise RuntimeError(f"Tool input failed schema validation for note: {note[:60]}...")

    input_tokens = int(response.usage.input_tokens)
    output_tokens = int(response.usage.output_tokens)

    result: ExtractResult = {
        "activity": tool_input,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "latencyMs": latency_ms,
        "cached": False,
    }

    if use_cache:
        _write_cache(
            prompt_version,
            note,
            {
                "activity": result["activity"],
                "inputTokens": result["inputTokens"],
                "outputTokens": result["outputTokens"],
                "latencyMs": result["latencyMs"],
            },
        )

    return result
