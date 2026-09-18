import { describe, expect, it } from "vitest";
import {
  activityTypeAccuracy,
  averageSetMetrics,
  hallucinationRate,
  nextActionDateExactMatchRate,
  nextActionNullHandlingAccuracy,
  officeNameAccuracy,
  perClassActivityTypeMetrics,
  type Pair,
} from "../src/lib/metrics.js";
import type { ActivityRecord } from "../src/types.js";

function activity(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    office_name: "Maplewood Family Dentistry",
    activity_type: "visit",
    contacts: ["Dr. Priya Nair"],
    products_mentioned: ["the SmileClear aligner kit"],
    outcome: "Went well.",
    next_action: "send quote",
    next_action_date: "2026-03-17",
    follow_up_needed: true,
    confidence: "high",
    ...overrides,
  };
}

describe("activityTypeAccuracy", () => {
  it("returns 1 when all predictions match", () => {
    const pairs: Pair[] = [{ predicted: activity(), label: activity() }];
    expect(activityTypeAccuracy(pairs)).toBe(1);
  });

  it("returns 0.5 for half correct", () => {
    const pairs: Pair[] = [
      {
        predicted: activity({ activity_type: "call" }),
        label: activity({ activity_type: "call" }),
      },
      {
        predicted: activity({ activity_type: "call" }),
        label: activity({ activity_type: "email" }),
      },
    ];
    expect(activityTypeAccuracy(pairs)).toBe(0.5);
  });

  it("returns 0 for an empty pair list", () => {
    expect(activityTypeAccuracy([])).toBe(0);
  });
});

describe("perClassActivityTypeMetrics", () => {
  it("computes precision/recall/F1 per class", () => {
    const pairs: Pair[] = [
      {
        predicted: activity({ activity_type: "call" }),
        label: activity({ activity_type: "call" }),
      },
      {
        predicted: activity({ activity_type: "call" }),
        label: activity({ activity_type: "email" }),
      },
      {
        predicted: activity({ activity_type: "email" }),
        label: activity({ activity_type: "email" }),
      },
    ];
    const metrics = perClassActivityTypeMetrics(pairs);
    const call = metrics.find((m) => m.activityType === "call");
    expect(call?.precision).toBeCloseTo(0.5);
    expect(call?.recall).toBeCloseTo(1);
    const email = metrics.find((m) => m.activityType === "email");
    expect(email?.precision).toBeCloseTo(1);
    expect(email?.recall).toBeCloseTo(0.5);
  });
});

describe("nextActionDateExactMatchRate", () => {
  it("matches on exact ISO date string", () => {
    const pairs: Pair[] = [
      {
        predicted: activity({ next_action_date: "2026-03-17" }),
        label: activity({ next_action_date: "2026-03-17" }),
      },
      {
        predicted: activity({ next_action_date: "2026-03-18" }),
        label: activity({ next_action_date: "2026-03-17" }),
      },
    ];
    expect(nextActionDateExactMatchRate(pairs)).toBe(0.5);
  });
});

describe("nextActionNullHandlingAccuracy", () => {
  it("rewards matching null-ness regardless of text", () => {
    const pairs: Pair[] = [
      {
        predicted: activity({ next_action: null }),
        label: activity({ next_action: null }),
      },
      {
        predicted: activity({ next_action: "call back" }),
        label: activity({ next_action: null }),
      },
    ];
    expect(nextActionNullHandlingAccuracy(pairs)).toBe(0.5);
  });
});

describe("averageSetMetrics", () => {
  it("is case-insensitive and computes F1", () => {
    const pairs: Pair[] = [
      {
        predicted: activity({
          products_mentioned: ["The SmileClear Aligner Kit"],
        }),
        label: activity({ products_mentioned: ["the smileclear aligner kit"] }),
      },
    ];
    const metrics = averageSetMetrics(pairs, "products_mentioned");
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.f1).toBe(1);
  });

  it("penalizes extra predicted items", () => {
    const pairs: Pair[] = [
      {
        predicted: activity({ contacts: ["Dr. Priya Nair", "Dr. Owen Blake"] }),
        label: activity({ contacts: ["Dr. Priya Nair"] }),
      },
    ];
    const metrics = averageSetMetrics(pairs, "contacts");
    expect(metrics.precision).toBe(0.5);
    expect(metrics.recall).toBe(1);
  });
});

describe("officeNameAccuracy", () => {
  it("normalizes case, punctuation, and whitespace", () => {
    const pairs: Pair[] = [
      {
        predicted: activity({ office_name: "maplewood  family dentistry." }),
        label: activity(),
      },
    ];
    expect(officeNameAccuracy(pairs)).toBe(1);
  });
});

describe("hallucinationRate", () => {
  it("flags a filled field when the label says null", () => {
    const pairs: Pair[] = [
      {
        predicted: activity({
          next_action: "call back",
          next_action_date: null,
        }),
        label: activity({ next_action: null, next_action_date: null }),
      },
      {
        predicted: activity({ next_action: null, next_action_date: null }),
        label: activity({ next_action: null, next_action_date: null }),
      },
    ];
    expect(hallucinationRate(pairs)).toBe(0.5);
  });
});

describe("empty set handling", () => {
  it("scores an empty prediction against an empty label as perfect", () => {
    const pairs = [
      {
        predicted: activity({ products_mentioned: [] }),
        label: activity({ products_mentioned: [] }),
      },
    ];
    expect(averageSetMetrics(pairs, "products_mentioned").f1).toBe(1);
  });

  it("still scores a hallucinated item against an empty label as zero", () => {
    const pairs = [
      {
        predicted: activity({ products_mentioned: ["SteriFlow sterilizer"] }),
        label: activity({ products_mentioned: [] }),
      },
    ];
    expect(averageSetMetrics(pairs, "products_mentioned").f1).toBe(0);
  });
});
