import { describe, it, expect, vi } from "vitest";
import { loadConfig, getDefaultProvider, resolveModel, AppConfigSchema } from "./index.js";

const validProviders = [
  {
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test-key",
    modelMappings: { gpt4: "gpt-4o" },
    isDefault: true,
  },
  {
    name: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "sk-deepseek",
  },
];

describe("loadConfig", () => {
  it("parses valid config from toml file", async () => {
    const config = await loadConfig("config.example.toml");

    expect(config.port).toBe(3000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.log_level).toBe("info");
    expect(config.database_path).toBe("./data/gateway.db");
    expect(config.providers).toHaveLength(1);
    expect(config.default_rpm).toBe(60);
    expect(config.default_tpm).toBe(100000);
  });

  it("applies default values when config file is missing", async () => {
    const config = await loadConfig("nonexistent.toml");

    expect(config.port).toBe(3000);
    expect(config.host).toBe("0.0.0.0");
    expect(config.log_level).toBe("info");
    expect(config.database_path).toBe("./data/gateway.db");
    expect(config.providers).toEqual([]);
    expect(config.default_rpm).toBe(60);
    expect(config.default_tpm).toBe(100000);
  });

  it("parses provider model mappings correctly", async () => {
    const config = await loadConfig("config.example.toml");

    expect(config.providers[0].modelMappings).toEqual({ "glm-5": "glm-5" });
  });
});

describe("getDefaultProvider", () => {
  it("returns the provider marked isDefault", () => {
    const config = AppConfigSchema.parse({ providers: validProviders });
    const provider = getDefaultProvider(config);
    expect(provider?.name).toBe("openai");
  });

  it("returns first provider when none is marked default", () => {
    const providers = [
      { name: "a", baseUrl: "https://a.com/v1", apiKey: "k1" },
      { name: "b", baseUrl: "https://b.com/v1", apiKey: "k2", isDefault: true },
    ];
    const config = AppConfigSchema.parse({ providers });
    expect(getDefaultProvider(config)?.name).toBe("b");
  });

  it("returns undefined when no providers configured", () => {
    const config = AppConfigSchema.parse({});
    expect(getDefaultProvider(config)).toBeUndefined();
  });
});

describe("resolveModel", () => {
  const provider = {
    name: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
    modelMappings: { gpt4: "gpt-4o", mini: "gpt-4o-mini" },
    isDefault: false,
  };

  it("resolves alias to real model name", () => {
    expect(resolveModel(provider, "gpt4")).toBe("gpt-4o");
  });

  it("returns original name when no mapping exists", () => {
    expect(resolveModel(provider, "gpt-3.5-turbo")).toBe("gpt-3.5-turbo");
  });
});

describe("AppConfigSchema type inference", () => {
  it("infers correct types from schema", () => {
    const parsed = AppConfigSchema.parse({
      port: 3000,
      providers: [
        { name: "test", baseUrl: "https://test.com/v1", apiKey: "key" },
      ],
    });

    expect(typeof parsed.port).toBe("number");
    expect(Array.isArray(parsed.providers)).toBe(true);
    expect(parsed.providers[0].name).toBe("test");
    expect(parsed.providers[0].isDefault).toBe(false);
    expect(parsed.providers[0].modelMappings).toEqual({});
  });

  it("throws when provider is missing required fields", () => {
    expect(() =>
      AppConfigSchema.parse({ providers: [{ name: "openai" }] }),
    ).toThrow();
  });

  it("throws when provider baseUrl is not a URL", () => {
    expect(() =>
      AppConfigSchema.parse({
        providers: [{ name: "bad", baseUrl: "not-a-url", apiKey: "key" }],
      }),
    ).toThrow();
  });

  it("throws on invalid log_level", () => {
    expect(() => AppConfigSchema.parse({ log_level: "verbose" })).toThrow();
  });

  it("allows empty providers array", () => {
    const config = AppConfigSchema.parse({ providers: [] });
    expect(config.providers).toEqual([]);
  });
});
