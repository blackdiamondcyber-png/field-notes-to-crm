"""Exact port of src/lib/metrics.ts. Every function here must reproduce the
TypeScript version bit for bit: same operation order, same constants, plain
Python floats only (no numpy, no math.fsum, no rounding)."""

from __future__ import annotations

import re
from typing import Literal, TypedDict

from fieldnotes.types import ACTIVITY_TYPES, ActivityRecord, ActivityType

_WHITESPACE_RE = re.compile(r"\s+")
_PUNCTUATION_RE = re.compile(r"[.,]")

SetField = Literal["contacts", "products_mentioned"]


class PrecisionRecallF1(TypedDict):
    precision: float
    recall: float
    f1: float


class PerClassMetric(TypedDict):
    activityType: ActivityType
    precision: float
    recall: float
    f1: float
    support: int


class Pair(TypedDict):
    predicted: ActivityRecord
    label: ActivityRecord


def safe_div(numerator: float, denominator: float) -> float:
    return 0.0 if denominator == 0 else numerator / denominator


def normalize_office_name(name: str) -> str:
    stripped = name.strip().lower()
    collapsed = _WHITESPACE_RE.sub(" ", stripped)
    return _PUNCTUATION_RE.sub("", collapsed)


def office_name_accuracy(pairs: list[Pair]) -> float:
    if len(pairs) == 0:
        return 0.0
    correct = sum(
        1
        for p in pairs
        if normalize_office_name(p["predicted"]["office_name"])
        == normalize_office_name(p["label"]["office_name"])
    )
    return correct / len(pairs)


def activity_type_accuracy(pairs: list[Pair]) -> float:
    if len(pairs) == 0:
        return 0.0
    correct = sum(
        1 for p in pairs if p["predicted"]["activity_type"] == p["label"]["activity_type"]
    )
    return correct / len(pairs)


def per_class_activity_type_metrics(pairs: list[Pair]) -> list[PerClassMetric]:
    results: list[PerClassMetric] = []
    for activity_type in ACTIVITY_TYPES:
        tp = 0
        fp = 0
        fn = 0
        support = 0
        for p in pairs:
            predicted = p["predicted"]["activity_type"] == activity_type
            actual = p["label"]["activity_type"] == activity_type
            if actual:
                support += 1
            if predicted and actual:
                tp += 1
            elif predicted and not actual:
                fp += 1
            elif not predicted and actual:
                fn += 1
        precision = safe_div(tp, tp + fp)
        recall = safe_div(tp, tp + fn)
        f1 = safe_div(2 * precision * recall, precision + recall)
        results.append(
            {
                "activityType": activity_type,
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "support": support,
            }
        )
    return results


def next_action_date_exact_match_rate(pairs: list[Pair]) -> float:
    if len(pairs) == 0:
        return 0.0
    matches = sum(
        1 for p in pairs if p["predicted"]["next_action_date"] == p["label"]["next_action_date"]
    )
    return matches / len(pairs)


def next_action_null_handling_accuracy(pairs: list[Pair]) -> float:
    if len(pairs) == 0:
        return 0.0
    matches = sum(
        1
        for p in pairs
        if (p["predicted"]["next_action"] is None) == (p["label"]["next_action"] is None)
    )
    return matches / len(pairs)


def _normalize_set_item(item: str) -> str:
    return item.strip().lower()


def _set_precision_recall_f1(predicted: list[str], label: list[str]) -> PrecisionRecallF1:
    pred_set = {_normalize_set_item(item) for item in predicted}
    label_set = {_normalize_set_item(item) for item in label}
    # Both empty is a correct answer, not a miss. See src/lib/metrics.ts for
    # why: scoring it 0 pinned this metric near 0.5 regardless of prompt.
    if len(pred_set) == 0 and len(label_set) == 0:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0}
    tp = sum(1 for item in pred_set if item in label_set)
    precision = safe_div(tp, len(pred_set))
    recall = safe_div(tp, len(label_set))
    f1 = safe_div(2 * precision * recall, precision + recall)
    return {"precision": precision, "recall": recall, "f1": f1}


def average_set_metrics(pairs: list[Pair], field: SetField) -> PrecisionRecallF1:
    if len(pairs) == 0:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}
    per_pair = [_set_precision_recall_f1(p["predicted"][field], p["label"][field]) for p in pairs]

    def avg(key: Literal["precision", "recall", "f1"]) -> float:
        total = 0.0
        for m in per_pair:
            total = total + m[key]
        return total / len(per_pair)

    return {"precision": avg("precision"), "recall": avg("recall"), "f1": avg("f1")}


def hallucination_rate(pairs: list[Pair]) -> float:
    if len(pairs) == 0:
        return 0.0
    hallucinated = 0
    for p in pairs:
        next_action_hallucinated = (
            p["label"]["next_action"] is None and p["predicted"]["next_action"] is not None
        )
        next_action_date_hallucinated = (
            p["label"]["next_action_date"] is None
            and p["predicted"]["next_action_date"] is not None
        )
        if next_action_hallucinated or next_action_date_hallucinated:
            hallucinated += 1
    return hallucinated / len(pairs)
