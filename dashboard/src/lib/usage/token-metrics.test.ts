import { describe, expect, it } from "vitest";
import { getCacheRate, getUncachedInputTokens } from "./token-metrics";

describe("usage token metrics", () => {
  it("splits cached input from total input", () => {
    expect(getUncachedInputTokens(100, 40)).toBe(60);
    expect(getCacheRate(100, 40)).toBeCloseTo(0.4);
  });

  it("never returns negative uncached input", () => {
    expect(getUncachedInputTokens(100, 120)).toBe(0);
  });

  it("returns a zero cache rate when input is zero", () => {
    expect(getCacheRate(0, 0)).toBe(0);
  });

  it("keeps cached and uncached input equal to total input for valid rows", () => {
    const inputTokens = 1_024;
    const cachedTokens = 768;

    expect(cachedTokens + getUncachedInputTokens(inputTokens, cachedTokens)).toBe(inputTokens);
  });
});
