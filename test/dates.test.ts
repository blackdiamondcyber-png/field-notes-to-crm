import { describe, expect, it } from "vitest";
import { resolveRelativeDate } from "../src/lib/dates.js";

describe("resolveRelativeDate", () => {
  it("resolves tomorrow", () => {
    expect(resolveRelativeDate("tomorrow", "2026-01-30")).toBe("2026-01-31");
  });

  it("crosses a month boundary", () => {
    expect(resolveRelativeDate("in 3 days", "2026-01-30")).toBe("2026-02-02");
  });

  it("crosses a year boundary with end of month", () => {
    expect(resolveRelativeDate("end of month", "2026-12-20")).toBe(
      "2026-12-31",
    );
  });

  it("resolves next month across a year boundary", () => {
    expect(resolveRelativeDate("next month", "2026-12-15")).toBe("2027-01-15");
  });

  it("resolves a bare month/day into the following year when it has passed", () => {
    expect(resolveRelativeDate("jan 3", "2026-12-29")).toBe("2027-01-03");
  });

  it("keeps a bare month/day in the same year when it has not passed", () => {
    expect(resolveRelativeDate("mar 3", "2026-01-05")).toBe("2026-03-03");
  });

  it("resolves next weekday to the following occurrence, skipping this week", () => {
    // 2026-03-12 is a Thursday.
    expect(resolveRelativeDate("next tues", "2026-03-12")).toBe("2026-03-17");
  });

  it("resolves a bare weekday to the nearest upcoming occurrence", () => {
    // 2026-03-12 is a Thursday; the next Friday is the very next day.
    expect(resolveRelativeDate("friday", "2026-03-12")).toBe("2026-03-13");
  });

  it("returns null for unresolvable phrases", () => {
    expect(resolveRelativeDate("after the holiday", "2026-12-18")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(resolveRelativeDate("", "2026-12-18")).toBeNull();
  });

  it("passes through an already-ISO date", () => {
    expect(resolveRelativeDate("2026-05-01", "2026-01-01")).toBe("2026-05-01");
  });
});
