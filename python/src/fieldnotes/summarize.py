"""Exact port of src/summarize.ts. Computes an EvalSummary dict whose keys,
nesting, and field values match the TypeScript EvalSummary JSON (camelCase
keys) so it can be compared directly against results/<v>.json."""

from __future__ import annotations

from typing import TypedDict

from fieldnotes.extract import (
    PRICE_PER_MILLION_INPUT,
    PRICE_PER_MILLION_OUTPUT,
    PromptVersion,
)
from fieldnotes.metrics import (
    Pair,
    PerClassMetric,
    PrecisionRecallF1,
    activity_type_accuracy,
    average_set_metrics,
    hallucination_rate,
    next_action_date_exact_match_rate,
    next_action_null_handling_accuracy,
    office_name_accuracy,
    per_class_activity_type_metrics,
)
from fieldnotes.types import ActivityRecord


class UsageRow(TypedDict):
    predicted: ActivityRecord
    label: ActivityRecord
    inputTokens: int
    outputTokens: int
    latencyMs: float


class EvalSummary(TypedDict):
    promptVersion: PromptVersion
    recordCount: int
    activityTypeAccuracy: float
    perClassActivityType: list[PerClassMetric]
    nextActionDateExactMatchRate: float
    nextActionNullHandlingAccuracy: float
    productsMentioned: PrecisionRecallF1
    contacts: PrecisionRecallF1
    officeNameAccuracy: float
    hallucinationRate: float
    meanLatencyMs: float
    totalInputTokens: int
    totalOutputTokens: int
    estimatedCostUsd: float
    failures: list[str]


def summarize(
    prompt_version: PromptVersion,
    rows: list[UsageRow],
    failures: list[str],
) -> EvalSummary:
    pairs: list[Pair] = [{"predicted": row["predicted"], "label": row["label"]} for row in rows]

    total_input_tokens = 0
    for row in rows:
        total_input_tokens = total_input_tokens + row["inputTokens"]

    total_output_tokens = 0
    for row in rows:
        total_output_tokens = total_output_tokens + row["outputTokens"]

    if len(rows) == 0:
        mean_latency_ms = 0.0
    else:
        latency_sum = 0.0
        for row in rows:
            latency_sum = latency_sum + row["latencyMs"]
        mean_latency_ms = latency_sum / len(rows)

    estimated_cost_usd = (total_input_tokens / 1_000_000) * PRICE_PER_MILLION_INPUT + (
        total_output_tokens / 1_000_000
    ) * PRICE_PER_MILLION_OUTPUT

    return {
        "promptVersion": prompt_version,
        "recordCount": len(pairs),
        "activityTypeAccuracy": activity_type_accuracy(pairs),
        "perClassActivityType": per_class_activity_type_metrics(pairs),
        "nextActionDateExactMatchRate": next_action_date_exact_match_rate(pairs),
        "nextActionNullHandlingAccuracy": next_action_null_handling_accuracy(pairs),
        "productsMentioned": average_set_metrics(pairs, "products_mentioned"),
        "contacts": average_set_metrics(pairs, "contacts"),
        "officeNameAccuracy": office_name_accuracy(pairs),
        "hallucinationRate": hallucination_rate(pairs),
        "meanLatencyMs": mean_latency_ms,
        "totalInputTokens": total_input_tokens,
        "totalOutputTokens": total_output_tokens,
        "estimatedCostUsd": estimated_cost_usd,
        "failures": failures,
    }


def _pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def summary_table(summary: EvalSummary) -> str:
    """Same table shape as src/eval.ts's summaryTable(). Human-readable
    only - never compared field by field, so it does not need to match the
    TypeScript version's rounding bit for bit."""
    rows = [
        ("Activity type accuracy", _pct(summary["activityTypeAccuracy"])),
        (
            "next_action_date exact match",
            _pct(summary["nextActionDateExactMatchRate"]),
        ),
        (
            "next_action null-handling accuracy",
            _pct(summary["nextActionNullHandlingAccuracy"]),
        ),
        ("products_mentioned F1", _pct(summary["productsMentioned"]["f1"])),
        ("contacts F1", _pct(summary["contacts"]["f1"])),
        ("office_name exact match", _pct(summary["officeNameAccuracy"])),
        ("Hallucination rate", _pct(summary["hallucinationRate"])),
        ("Mean latency", f"{summary['meanLatencyMs']:.0f} ms"),
        (
            "Total tokens (in/out)",
            f"{summary['totalInputTokens']} / {summary['totalOutputTokens']}",
        ),
        ("Estimated cost", f"${summary['estimatedCostUsd']:.4f}"),
    ]
    return "\n".join(f"| {label} | {value} |" for label, value in rows)
