import { describe, expect, it } from "vitest";

import { getUsageDateRange } from "./date-range";

const currentDate = new Date(2026, 7, 27, 12, 30);

describe("getUsageDateRange", () => {
  it("returns exactly today's local calendar date", () => {
    expect(getUsageDateRange("today", undefined, undefined, currentDate)).toEqual({
      from: "2026-08-27",
      to: "2026-08-27",
    });
  });

  it("returns seven inclusive local calendar dates", () => {
    expect(getUsageDateRange("7d", undefined, undefined, currentDate)).toEqual({
      from: "2026-08-21",
      to: "2026-08-27",
    });
  });

  it("returns thirty inclusive local calendar dates", () => {
    expect(getUsageDateRange("30d", undefined, undefined, currentDate)).toEqual({
      from: "2026-07-29",
      to: "2026-08-27",
    });
  });

  it("handles ranges that cross a month boundary", () => {
    const monthBoundary = new Date(2024, 2, 1, 12, 30);

    expect(getUsageDateRange("7d", undefined, undefined, monthBoundary)).toEqual({
      from: "2024-02-24",
      to: "2024-03-01",
    });
    expect(getUsageDateRange("30d", undefined, undefined, monthBoundary)).toEqual({
      from: "2024-02-01",
      to: "2024-03-01",
    });
  });

  it("preserves custom ranges and defaults missing custom values to today", () => {
    expect(getUsageDateRange("custom", "2026-01-15", "2026-02-20", currentDate)).toEqual({
      from: "2026-01-15",
      to: "2026-02-20",
    });
    expect(getUsageDateRange("custom", undefined, "2026-02-20", currentDate)).toEqual({
      from: "2026-08-27",
      to: "2026-02-20",
    });
  });

  it("preserves all-time and fallback ranges", () => {
    const allTime = { from: "2020-01-01", to: "2099-12-31" };

    expect(getUsageDateRange("all", undefined, undefined, currentDate)).toEqual(allTime);
    expect(getUsageDateRange("unsupported", undefined, undefined, currentDate)).toEqual(allTime);
    expect(getUsageDateRange(undefined, undefined, undefined, currentDate)).toEqual(allTime);
  });
});
