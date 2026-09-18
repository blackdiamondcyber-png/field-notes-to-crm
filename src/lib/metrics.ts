import type { ActivityRecord, ActivityType } from "../types.js";
import { ACTIVITY_TYPES } from "../types.js";

export interface PrecisionRecallF1 {
  precision: number;
  recall: number;
  f1: number;
}

export interface PerClassMetric extends PrecisionRecallF1 {
  activityType: ActivityType;
  support: number;
}

export interface Pair {
  predicted: ActivityRecord;
  label: ActivityRecord;
}

function safeDiv(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function normalizeOfficeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]/g, "");
}

export function officeNameAccuracy(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return 0;
  const correct = pairs.filter(
    (p) =>
      normalizeOfficeName(p.predicted.office_name) ===
      normalizeOfficeName(p.label.office_name),
  ).length;
  return correct / pairs.length;
}

export function activityTypeAccuracy(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return 0;
  const correct = pairs.filter(
    (p) => p.predicted.activity_type === p.label.activity_type,
  ).length;
  return correct / pairs.length;
}

export function perClassActivityTypeMetrics(
  pairs: readonly Pair[],
): PerClassMetric[] {
  return ACTIVITY_TYPES.map((activityType) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;
    for (const p of pairs) {
      const predicted = p.predicted.activity_type === activityType;
      const actual = p.label.activity_type === activityType;
      if (actual) support += 1;
      if (predicted && actual) tp += 1;
      else if (predicted && !actual) fp += 1;
      else if (!predicted && actual) fn += 1;
    }
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    return { activityType, precision, recall, f1, support };
  });
}

export function nextActionDateExactMatchRate(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return 0;
  const matches = pairs.filter(
    (p) => p.predicted.next_action_date === p.label.next_action_date,
  ).length;
  return matches / pairs.length;
}

/** Fraction of records where predicted-null-ness of next_action matches the label's. */
export function nextActionNullHandlingAccuracy(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return 0;
  const matches = pairs.filter(
    (p) =>
      (p.predicted.next_action === null) === (p.label.next_action === null),
  ).length;
  return matches / pairs.length;
}

function normalizeSetItem(item: string): string {
  return item.trim().toLowerCase();
}

function setPrecisionRecallF1(
  predicted: string[],
  label: string[],
): PrecisionRecallF1 {
  const predSet = new Set(predicted.map(normalizeSetItem));
  const labelSet = new Set(label.map(normalizeSetItem));
  let tp = 0;
  for (const item of predSet) {
    if (labelSet.has(item)) tp += 1;
  }
  const precision = safeDiv(tp, predSet.size);
  const recall = safeDiv(tp, labelSet.size);
  const f1 = safeDiv(2 * precision * recall, precision + recall);
  return { precision, recall, f1 };
}

/** Averages set precision/recall/F1 for a list-valued field across all pairs. */
export function averageSetMetrics(
  pairs: readonly Pair[],
  field: "contacts" | "products_mentioned",
): PrecisionRecallF1 {
  if (pairs.length === 0) return { precision: 0, recall: 0, f1: 0 };
  const perPair = pairs.map((p) =>
    setPrecisionRecallF1(p.predicted[field], p.label[field]),
  );
  const avg = (key: keyof PrecisionRecallF1): number =>
    perPair.reduce((sum, m) => sum + m[key], 0) / perPair.length;
  return { precision: avg("precision"), recall: avg("recall"), f1: avg("f1") };
}

/**
 * Hallucination rate: fraction of records where the model filled in
 * next_action or next_action_date with a non-null value when the label says
 * that field should be null.
 */
export function hallucinationRate(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return 0;
  const hallucinated = pairs.filter((p) => {
    const nextActionHallucinated =
      p.label.next_action === null && p.predicted.next_action !== null;
    const nextActionDateHallucinated =
      p.label.next_action_date === null &&
      p.predicted.next_action_date !== null;
    return nextActionHallucinated || nextActionDateHallucinated;
  }).length;
  return hallucinated / pairs.length;
}
