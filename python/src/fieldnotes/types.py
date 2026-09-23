"""Port of src/types.ts. Keep field names, literal values, and the
ACTIVITY_TYPES order identical to the TypeScript source."""

from __future__ import annotations

from typing import Literal, TypedDict

ActivityType = Literal["call", "email", "visit", "note", "demo", "quote"]

Confidence = Literal["high", "medium", "low"]


class ActivityRecord(TypedDict):
    office_name: str
    activity_type: ActivityType
    contacts: list[str]
    products_mentioned: list[str]
    outcome: str
    next_action: str | None
    next_action_date: str | None
    follow_up_needed: bool
    confidence: Confidence


class NoteRecord(TypedDict):
    id: str
    noted_at: str
    note: str
    label: ActivityRecord


# Same order as src/types.ts. Order matters: per-class metrics iterate this
# tuple, and their output order is part of the compared JSON.
ACTIVITY_TYPES: tuple[ActivityType, ...] = (
    "call",
    "email",
    "visit",
    "note",
    "demo",
    "quote",
)
