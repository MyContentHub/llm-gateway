import { describe, it, expect } from "vitest";
import { calculateCost, BUILT_IN_PRICING } from "./cost.js";

describe("calculateCost", () => {
  describe("built-in pricing", () => {
    it("calculates cost for gpt-4o", () => {
      const cost = calculateCost("gpt-4o", 1000, 500);
      const expected = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10.0;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for gpt-3.5-turbo", () => {
      const cost = calculateCost("gpt-3.5-turbo", 2000, 1000);
      const expected = (2000 / 1_000_000) * 0.5 + (1000 / 1_000_000) * 1.5;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for gpt-4-turbo", () => {
      const cost = calculateCost("gpt-4-turbo", 500, 200);
      const expected = (500 / 1_000_000) * 10.0 + (200 / 1_000_000) * 30.0;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for gpt-4", () => {
      const cost = calculateCost("gpt-4", 100, 50);
      const expected = (100 / 1_000_000) * 30.0 + (50 / 1_000_000) * 60.0;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for gpt-4o-mini", () => {
      const cost = calculateCost("gpt-4o-mini", 10000, 5000);
      const expected = (10000 / 1_000_000) * 0.15 + (5000 / 1_000_000) * 0.6;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for claude-3-opus", () => {
      const cost = calculateCost("claude-3-opus", 1000, 500);
      const expected = (1000 / 1_000_000) * 15.0 + (500 / 1_000_000) * 75.0;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for claude-3-sonnet", () => {
      const cost = calculateCost("claude-3-sonnet", 3000, 1000);
      const expected = (3000 / 1_000_000) * 3.0 + (1000 / 1_000_000) * 15.0;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for claude-3-haiku", () => {
      const cost = calculateCost("claude-3-haiku", 5000, 2000);
      const expected = (5000 / 1_000_000) * 0.25 + (2000 / 1_000_000) * 1.25;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for text-embedding-ada-002 (input only)", () => {
      const cost = calculateCost("text-embedding-ada-002", 10000, 0);
      const expected = (10000 / 1_000_000) * 0.1;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for text-embedding-3-small (input only)", () => {
      const cost = calculateCost("text-embedding-3-small", 10000, 0);
      const expected = (10000 / 1_000_000) * 0.02;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("calculates cost for text-embedding-3-large (input only)", () => {
      const cost = calculateCost("text-embedding-3-large", 10000, 0);
      const expected = (10000 / 1_000_000) * 0.13;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("all built-in models are present in BUILT_IN_PRICING", () => {
      const expectedModels = [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-4",
        "gpt-3.5-turbo",
        "claude-3-opus",
        "claude-3-sonnet",
        "claude-3-haiku",
        "text-embedding-ada-002",
        "text-embedding-3-small",
        "text-embedding-3-large",
      ];
      for (const model of expectedModels) {
        expect(BUILT_IN_PRICING).toHaveProperty(model);
        expect(BUILT_IN_PRICING[model].input).toBeGreaterThan(0);
        expect(typeof BUILT_IN_PRICING[model].output).toBe("number");
      }
    });
  });

  describe("unknown models", () => {
    it("returns 0 for unknown model", () => {
      expect(calculateCost("unknown-model", 1000, 500)).toBe(0);
    });

    it("returns 0 for empty string model", () => {
      expect(calculateCost("", 1000, 500)).toBe(0);
    });
  });

  describe("custom overrides", () => {
    it("uses override pricing instead of built-in", () => {
      const overrides = {
        "my-custom-model": { input: 5.0, output: 20.0 },
      };
      const cost = calculateCost("my-custom-model", 1000, 500, overrides);
      const expected = (1000 / 1_000_000) * 5.0 + (500 / 1_000_000) * 20.0;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("override takes precedence over built-in pricing", () => {
      const overrides = {
        "gpt-4o": { input: 99.0, output: 99.0 },
      };
      const cost = calculateCost("gpt-4o", 1000, 0, overrides);
      expect(cost).toBeCloseTo((1000 / 1_000_000) * 99.0, 10);
    });

    it("built-in model is used when not overridden", () => {
      const overrides = {
        "my-custom-model": { input: 5.0, output: 20.0 },
      };
      const cost = calculateCost("gpt-4o", 1000, 500, overrides);
      const expected = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10.0;
      expect(cost).toBeCloseTo(expected, 10);
    });

    it("empty overrides object falls back to built-in", () => {
      const cost = calculateCost("gpt-4o", 1000, 500, {});
      const expected = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10.0;
      expect(cost).toBeCloseTo(expected, 10);
    });
  });

  describe("edge cases", () => {
    it("returns 0 for zero prompt and completion tokens", () => {
      expect(calculateCost("gpt-4o", 0, 0)).toBe(0);
    });

    it("calculates cost with zero completion tokens", () => {
      const cost = calculateCost("gpt-4o", 1000, 0);
      expect(cost).toBeCloseTo((1000 / 1_000_000) * 2.5, 10);
    });

    it("calculates cost with zero prompt tokens", () => {
      const cost = calculateCost("gpt-4o", 0, 1000);
      expect(cost).toBeCloseTo((1000 / 1_000_000) * 10.0, 10);
    });

    it("handles large token counts", () => {
      const cost = calculateCost("gpt-4o", 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(2.5 + 10.0, 10);
    });

    it("embedding model returns 0 for completion tokens", () => {
      const cost = calculateCost("text-embedding-ada-002", 1000, 1000);
      const expected = (1000 / 1_000_000) * 0.1 + (1000 / 1_000_000) * 0.0;
      expect(cost).toBeCloseTo(expected, 10);
    });
  });
});
