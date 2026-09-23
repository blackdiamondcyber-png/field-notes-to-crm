import type { EvalSummary } from "../summarize.js";

/** The metrics the regression gate protects. */
export const HEADLINE_METRICS: ReadonlyArray<{
  key:
    | "activityTypeAccuracy"
    | "nextActionDateExactMatchRate"
    | "officeNameAccuracy";
  label: string;
}> = [
  { key: "activityTypeAccuracy", label: "activity type accuracy" },
  {
    key: "nextActionDateExactMatchRate",
    label: "next_action_date exact match",
  },
  { key: "officeNameAccuracy", label: "office_name exact match" },
];

/** A drop of more than two points (0.02) on any headline metric fails the gate. */
export const MAX_DROP = 0.02;

// Rates are ratios of small integers, so 0.94 - 0.92 comes out as
// 0.020000000000000018. Without a tolerance, a drop of exactly two points
// would fail a gate documented as "more than two points".
const EPSILON = 1e-9;

export interface GateCheck {
  label: string;
  baseline: number;
  current: number;
  drop: number;
  passed: boolean;
}

export function checkGate(
  baseline: Pick<EvalSummary, (typeof HEADLINE_METRICS)[number]["key"]>,
  current: Pick<EvalSummary, (typeof HEADLINE_METRICS)[number]["key"]>,
): GateCheck[] {
  return HEADLINE_METRICS.map(({ key, label }) => {
    const drop = baseline[key] - current[key];
    return {
      label,
      baseline: baseline[key],
      current: current[key],
      drop,
      passed: drop <= MAX_DROP + EPSILON,
    };
  });
}
