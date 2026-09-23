"""Port of every case in test/metrics.test.ts (the TypeScript metrics test
suite), so the Python metrics port is checked against the same behaviour."""

from __future__ import annotations

from typing import Any

from fieldnotes.metrics import (
    Pair,
    activity_type_accuracy,
    average_set_metrics,
    hallucination_rate,
    next_action_date_exact_match_rate,
    next_action_null_handling_accuracy,
    office_name_accuracy,
    per_class_activity_type_metrics,
)
from fieldnotes.types import ActivityRecord


def activity(**overrides: Any) -> ActivityRecord:
    base: ActivityRecord = {
        "office_name": "Maplewood Family Dentistry",
        "activity_type": "visit",
        "contacts": ["Dr. Priya Nair"],
        "products_mentioned": ["the SmileClear aligner kit"],
        "outcome": "Went well.",
        "next_action": "send quote",
        "next_action_date": "2026-03-17",
        "follow_up_needed": True,
        "confidence": "high",
    }
    return {**base, **overrides}  # type: ignore[typeddict-item]


class TestActivityTypeAccuracy:
    def test_returns_1_when_all_predictions_match(self) -> None:
        pairs: list[Pair] = [{"predicted": activity(), "label": activity()}]
        assert activity_type_accuracy(pairs) == 1

    def test_returns_0_5_for_half_correct(self) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(activity_type="call"),
                "label": activity(activity_type="call"),
            },
            {
                "predicted": activity(activity_type="call"),
                "label": activity(activity_type="email"),
            },
        ]
        assert activity_type_accuracy(pairs) == 0.5

    def test_returns_0_for_an_empty_pair_list(self) -> None:
        assert activity_type_accuracy([]) == 0


class TestPerClassActivityTypeMetrics:
    def test_computes_precision_recall_f1_per_class(self) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(activity_type="call"),
                "label": activity(activity_type="call"),
            },
            {
                "predicted": activity(activity_type="call"),
                "label": activity(activity_type="email"),
            },
            {
                "predicted": activity(activity_type="email"),
                "label": activity(activity_type="email"),
            },
        ]
        metrics = per_class_activity_type_metrics(pairs)
        call = next(m for m in metrics if m["activityType"] == "call")
        assert call["precision"] == 0.5
        assert call["recall"] == 1
        email = next(m for m in metrics if m["activityType"] == "email")
        assert email["precision"] == 1
        assert email["recall"] == 0.5


class TestNextActionDateExactMatchRate:
    def test_matches_on_exact_iso_date_string(self) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(next_action_date="2026-03-17"),
                "label": activity(next_action_date="2026-03-17"),
            },
            {
                "predicted": activity(next_action_date="2026-03-18"),
                "label": activity(next_action_date="2026-03-17"),
            },
        ]
        assert next_action_date_exact_match_rate(pairs) == 0.5


class TestNextActionNullHandlingAccuracy:
    def test_rewards_matching_null_ness_regardless_of_text(self) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(next_action=None),
                "label": activity(next_action=None),
            },
            {
                "predicted": activity(next_action="call back"),
                "label": activity(next_action=None),
            },
        ]
        assert next_action_null_handling_accuracy(pairs) == 0.5


class TestAverageSetMetrics:
    def test_is_case_insensitive_and_computes_f1(self) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(products_mentioned=["The SmileClear Aligner Kit"]),
                "label": activity(products_mentioned=["the smileclear aligner kit"]),
            }
        ]
        metrics = average_set_metrics(pairs, "products_mentioned")
        assert metrics["precision"] == 1
        assert metrics["recall"] == 1
        assert metrics["f1"] == 1

    def test_penalizes_extra_predicted_items(self) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(contacts=["Dr. Priya Nair", "Dr. Owen Blake"]),
                "label": activity(contacts=["Dr. Priya Nair"]),
            }
        ]
        metrics = average_set_metrics(pairs, "contacts")
        assert metrics["precision"] == 0.5
        assert metrics["recall"] == 1


class TestOfficeNameAccuracy:
    def test_normalizes_case_punctuation_and_whitespace(self) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(office_name="maplewood  family dentistry."),
                "label": activity(),
            }
        ]
        assert office_name_accuracy(pairs) == 1


class TestHallucinationRate:
    def test_flags_a_filled_field_when_the_label_says_null(self) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(next_action="call back", next_action_date=None),
                "label": activity(next_action=None, next_action_date=None),
            },
            {
                "predicted": activity(next_action=None, next_action_date=None),
                "label": activity(next_action=None, next_action_date=None),
            },
        ]
        assert hallucination_rate(pairs) == 0.5


class TestEmptySetHandling:
    def test_scores_an_empty_prediction_against_an_empty_label_as_perfect(
        self,
    ) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(products_mentioned=[]),
                "label": activity(products_mentioned=[]),
            }
        ]
        assert average_set_metrics(pairs, "products_mentioned")["f1"] == 1

    def test_still_scores_a_hallucinated_item_against_an_empty_label_as_zero(
        self,
    ) -> None:
        pairs: list[Pair] = [
            {
                "predicted": activity(products_mentioned=["SteriFlow sterilizer"]),
                "label": activity(products_mentioned=[]),
            }
        ]
        assert average_set_metrics(pairs, "products_mentioned")["f1"] == 0
