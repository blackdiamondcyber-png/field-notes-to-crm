import { describe, expect, it } from "vitest";
import { checkGate, HEADLINE_METRICS } from "../src/lib/gate.js";

const baseline = {
  activityTypeAccuracy: 0.94,
  nextActionDateExactMatchRate: 0.9,
  officeNameAccuracy: 0.98,
};

describe("checkGate", () => {
  it("passes when nothing changed", () => {
    expect(checkGate(baseline, baseline).every((c) => c.passed)).toBe(true);
  });

  it("checks exactly the three headline metrics", () => {
    expect(checkGate(baseline, baseline).map((c) => c.label)).toEqual(
      HEADLINE_METRICS.map((m) => m.label),
    );
  });

  it("passes a drop of exactly two points, the documented limit", () => {
    const current = { ...baseline, activityTypeAccuracy: 0.92 };
    expect(checkGate(baseline, current).every((c) => c.passed)).toBe(true);
  });

  it("fails a drop of more than two points on any headline metric", () => {
    const current = { ...baseline, officeNameAccuracy: 0.955 };
    const checks = checkGate(baseline, current);
    expect(
      checks.find((c) => c.label === "office_name exact match")?.passed,
    ).toBe(false);
    expect(checks.filter((c) => !c.passed)).toHaveLength(1);
  });

  it("fails on the real v1 to v2 activity-type regression", () => {
    // results/v1.json 94.0% -> results/v2.json 85.3%, the drop the README describes.
    const current = { ...baseline, activityTypeAccuracy: 128 / 150 };
    const check = checkGate(
      { ...baseline, activityTypeAccuracy: 141 / 150 },
      current,
    )[0];
    expect(check?.passed).toBe(false);
    expect(check?.drop).toBeCloseTo(13 / 150, 10);
  });

  it("never fails an improvement", () => {
    const current = {
      activityTypeAccuracy: 1,
      nextActionDateExactMatchRate: 1,
      officeNameAccuracy: 1,
    };
    expect(checkGate(baseline, current).every((c) => c.passed)).toBe(true);
  });
});
