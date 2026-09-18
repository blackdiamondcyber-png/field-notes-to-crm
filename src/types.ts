export type ActivityType = "call" | "email" | "visit" | "note" | "demo" | "quote";

export type Confidence = "high" | "medium" | "low";

export interface ActivityRecord {
  office_name: string;
  activity_type: ActivityType;
  contacts: string[];
  products_mentioned: string[];
  outcome: string;
  next_action: string | null;
  next_action_date: string | null;
  follow_up_needed: boolean;
  confidence: Confidence;
}

export interface NoteRecord {
  id: string;
  noted_at: string;
  note: string;
  label: ActivityRecord;
}

export const ACTIVITY_TYPES: ActivityType[] = [
  "call",
  "email",
  "visit",
  "note",
  "demo",
  "quote",
];
