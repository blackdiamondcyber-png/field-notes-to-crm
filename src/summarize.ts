import {
  PRICE_PER_MILLION_INPUT,
  PRICE_PER_MILLION_OUTPUT,
} from "./extract.js";
import type { PromptVersion } from "./extract.js";
import {
  activityTypeAccuracy,
  averageSetMetrics,
  hallucinationRate,
  nextActionDateExactMatchRate,
  nextActionNullHandlingAccuracy,
  officeNameAccuracy,
  perClassActivityTypeMetrics,
  type Pair,
} from "./lib/metrics.js";
import type { ActivityRecord } from "./types.js";

export interface UsageRow {
  predicted: ActivityRecord;
  label: ActivityRecord;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface EvalSummary {
  promptVersion: PromptVersion;
  recordCount: number;
  activityTypeAccuracy: number;
  perClassActivityType: ReturnType<typeof perClassActivityTypeMetrics>;
  nextActionDateExactMatchRate: number;
  nextActionNullHandlingAccuracy: number;
  productsMentioned: ReturnType<typeof averageSetMetrics>;
  contacts: ReturnType<typeof averageSetMetrics>;
  officeNameAccuracy: number;
  hallucinationRate: number;
  meanLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  failures: string[];
}

/**
 * Computes an EvalSummary from usage rows (predicted/label pairs plus token
 * and latency usage) and a list of failure messages. Pure: no I/O, no model
 * calls. Used by both the live eval (src/eval.ts) and the offline scorer
 * (src/score.ts) so the two share exactly one implementation of every field.
 */
export function summarize(
  promptVersion: PromptVersion,
  rows: readonly UsageRow[],
  failures: string[],
): EvalSummary {
  const pairs: Pair[] = rows.map((row) => ({
    predicted: row.predicted,
    label: row.label,
  }));

  const totalInputTokens = rows.reduce((sum, row) => sum + row.inputTokens, 0);
  const totalOutputTokens = rows.reduce(
    (sum, row) => sum + row.outputTokens,
    0,
  );
  const meanLatencyMs =
    rows.length === 0
      ? 0
      : rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length;
  const estimatedCostUsd =
    (totalInputTokens / 1_000_000) * PRICE_PER_MILLION_INPUT +
    (totalOutputTokens / 1_000_000) * PRICE_PER_MILLION_OUTPUT;

  return {
    promptVersion,
    recordCount: pairs.length,
    activityTypeAccuracy: activityTypeAccuracy(pairs),
    perClassActivityType: perClassActivityTypeMetrics(pairs),
    nextActionDateExactMatchRate: nextActionDateExactMatchRate(pairs),
    nextActionNullHandlingAccuracy: nextActionNullHandlingAccuracy(pairs),
    productsMentioned: averageSetMetrics(pairs, "products_mentioned"),
    contacts: averageSetMetrics(pairs, "contacts"),
    officeNameAccuracy: officeNameAccuracy(pairs),
    hallucinationRate: hallucinationRate(pairs),
    meanLatencyMs,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostUsd,
    failures,
  };
}
