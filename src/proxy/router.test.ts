import { describe, it, expect } from "vitest";
import { resolveRoute, RouteError } from "./router.js";
import type { ProviderConfig } from "../config/providers.js";

const openai: ProviderConfig = {
  name: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "sk-openai-key",
  modelMappings: { "gpt-4o": "gpt-4o", "gpt-4o-mini": "gpt-4o-mini" },
  isDefault: false,
};

const anthropic: ProviderConfig = {
  name: "anthropic",
  baseUrl: "https://api.anthropic.com/v1",
  apiKey: "sk-ant-key",
  modelMappings: { "fast-chat": "claude-3-haiku", "smart-chat": "claude-3-opus" },
  isDefault: false,
};

const fallback: ProviderConfig = {
  name: "fallback",
  baseUrl: "https://fallback.example.com/v1",
  apiKey: "sk-fallback-key",
  modelMappings: {},
  isDefault: true,
};

describe("resolveRoute", () => {
  it("resolves a model mapped directly to a provider", () => {
    const result = resolveRoute("gpt-4o", [openai, anthropic]);

    expect(result).toEqual({
      providerName: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-openai-key",
      resolvedModel: "gpt-4o",
    });
  });

  it("resolves an aliased model to the target model name on the mapped provider", () => {
    const result = resolveRoute("fast-chat", [openai, anthropic]);

    expect(result).toEqual({
      providerName: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "sk-ant-key",
      resolvedModel: "claude-3-haiku",
    });
  });

  it("falls back to the default provider when model is not in any mapping", () => {
    const result = resolveRoute("unknown-model-xyz", [openai, anthropic, fallback]);

    expect(result).toEqual({
      providerName: "fallback",
      baseUrl: "https://fallback.example.com/v1",
      apiKey: "sk-fallback-key",
      resolvedModel: "unknown-model-xyz",
    });
  });

  it("uses first provider as default when no isDefault is set", () => {
    const noDefault: ProviderConfig = {
      name: "first",
      baseUrl: "https://first.example.com/v1",
      apiKey: "sk-first",
      modelMappings: {},
      isDefault: false,
    };
    const result = resolveRoute("unknown-model", [noDefault]);

    expect(result.providerName).toBe("first");
    expect(result.resolvedModel).toBe("unknown-model");
  });

  it("throws RouteError with statusCode 404 when no providers exist", () => {
    expect(() => resolveRoute("gpt-4o", [])).toThrow(RouteError);
    expect(() => resolveRoute("gpt-4o", [])).toThrow("No provider found for model 'gpt-4o'");
  });

  it("throws RouteError with statusCode 404", () => {
    try {
      resolveRoute("anything", []);
    } catch (err) {
      expect(err).toBeInstanceOf(RouteError);
      expect((err as RouteError).statusCode).toBe(404);
    }
  });

  it("handles provider with undefined modelMappings", () => {
    const noMappings: ProviderConfig = {
      name: "bare",
      baseUrl: "https://bare.example.com/v1",
      apiKey: "sk-bare",
      modelMappings: undefined as unknown as Record<string, string>,
      isDefault: true,
    };

    const result = resolveRoute("some-model", [noMappings]);

    expect(result.resolvedModel).toBe("some-model");
    expect(result.providerName).toBe("bare");
  });
});
