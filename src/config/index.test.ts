import { describe, it, expect } from "vitest";
import { loadConfig, getDefaultProvider, resolveModel, AppConfigSchema } from "./index.js";

const validProviders = JSON.stringify([
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
]);

describe("loadConfig", () => {
  it("parses valid config with all fields", () => {
    const config = loadConfig({
      PORT: "8080",
      HOST: "127.0.0.1",
      LOG_LEVEL: "debug",
      DATABASE_PATH: "./test.db",
      ENCRYPTION_KEY: "abc123",
      PROVIDERS: validProviders,
      DEFAULT_RPM: "120",
      DEFAULT_TPM: "200000",
    });

    expect(config.PORT).toBe(8080);
    expect(config.HOST).toBe("127.0.0.1");
    expect(config.LOG_LEVEL).toBe("debug");
    expect(config.DATABASE_PATH).toBe("./test.db");
    expect(config.ENCRYPTION_KEY).toBe("abc123");
    expect(config.PROVIDERS).toHaveLength(2);
    expect(config.DEFAULT_RPM).toBe(120);
    expect(config.DEFAULT_TPM).toBe(200000);
  });

  it("applies default values when fields are missing", () => {
    const config = loadConfig({});

    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.DATABASE_PATH).toBe("./data/gateway.db");
    expect(config.PROVIDERS).toEqual([]);
    expect(config.DEFAULT_RPM).toBe(60);
    expect(config.DEFAULT_TPM).toBe(100000);
  });

  it("parses provider model mappings correctly", () => {
    const config = loadConfig({ PROVIDERS: validProviders });

    expect(config.PROVIDERS[0].modelMappings).toEqual({ gpt4: "gpt-4o" });
    expect(config.PROVIDERS[1].modelMappings).toEqual({});
  });

  it("coerces PORT from string to number", () => {
    const config = loadConfig({ PORT: "4000" });
    expect(config.PORT).toBe(4000);
  });

  it("throws on invalid LOG_LEVEL", () => {
    expect(() => loadConfig({ LOG_LEVEL: "verbose" })).toThrow();
  });

  it("throws on invalid PROVIDERS JSON", () => {
    expect(() => loadConfig({ PROVIDERS: "not-json" })).toThrow();
  });

  it("throws when provider is missing required fields", () => {
    const badProviders = JSON.stringify([{ name: "openai" }]);
    expect(() => loadConfig({ PROVIDERS: badProviders })).toThrow();
  });

  it("throws when provider baseUrl is not a URL", () => {
    const badProviders = JSON.stringify([
      { name: "bad", baseUrl: "not-a-url", apiKey: "key" },
    ]);
    expect(() => loadConfig({ PROVIDERS: badProviders })).toThrow();
  });

  it("throws on non-integer PORT", () => {
    expect(() => loadConfig({ PORT: "3.14" })).toThrow();
  });

  it("allows empty providers array", () => {
    const config = loadConfig({ PROVIDERS: "[]" });
    expect(config.PROVIDERS).toEqual([]);
  });
});

describe("getDefaultProvider", () => {
  it("returns the provider marked isDefault", () => {
    const config = loadConfig({ PROVIDERS: validProviders });
    const provider = getDefaultProvider(config);
    expect(provider?.name).toBe("openai");
  });

  it("returns first provider when none is marked default", () => {
    const providers = JSON.stringify([
      { name: "a", baseUrl: "https://a.com/v1", apiKey: "k1" },
      { name: "b", baseUrl: "https://b.com/v1", apiKey: "k2", isDefault: true },
    ]);
    const config = loadConfig({ PROVIDERS: providers });
    expect(getDefaultProvider(config)?.name).toBe("b");
  });

  it("returns undefined when no providers configured", () => {
    const config = loadConfig({});
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
      PORT: "3000",
      PROVIDERS: JSON.stringify([
        { name: "test", baseUrl: "https://test.com/v1", apiKey: "key" },
      ]),
    });

    expect(typeof parsed.PORT).toBe("number");
    expect(Array.isArray(parsed.PROVIDERS)).toBe(true);
    expect(parsed.PROVIDERS[0].name).toBe("test");
    expect(parsed.PROVIDERS[0].isDefault).toBe(false);
    expect(parsed.PROVIDERS[0].modelMappings).toEqual({});
  });
});
