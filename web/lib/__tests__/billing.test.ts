import { describe, expect, it } from "vitest";
import { creditsForUsage } from "../billing";

describe("creditsForUsage", () => {
  it("weights output higher than input and is integer", () => {
    const credits = creditsForUsage({
      inputTokens: 100,
      outputTokens: 100,
      cacheReadTokens: 0,
      cacheCreateTokens: 0,
    });
    // 100*1 + 100*5 = 600
    expect(credits).toBe(600);
    expect(Number.isInteger(credits)).toBe(true);
  });

  it("charges cache reads at a deep discount", () => {
    const credits = creditsForUsage({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1000,
      cacheCreateTokens: 0,
    });
    // 1000 * 0.1 = 100
    expect(credits).toBe(100);
  });

  it("rounds up fractional totals", () => {
    const credits = creditsForUsage({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1,
      cacheCreateTokens: 0,
    });
    // 0.1 -> ceil -> 1
    expect(credits).toBe(1);
  });

  it("returns 0 for an empty usage record", () => {
    expect(
      creditsForUsage({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
      })
    ).toBe(0);
  });
});
