import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockUpstream, createGateway, getServerUrl } from "../helpers/mock-upstream.js";

describe("Models Integration", () => {
  let upstream: FastifyInstance;
  let gateway: FastifyInstance;

  beforeAll(async () => {
    upstream = await createMockUpstream();
    gateway = await createGateway(getServerUrl(upstream));
  });

  afterAll(async () => {
    await gateway.close();
    await upstream.close();
  });

  it("returns prefixed model list from provider", async () => {
    const response = await gateway.inject({
      method: "GET",
      url: "/v1/models",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe("test-provider/gpt-4o");
    expect(body.data[1].id).toBe("test-provider/gpt-4o-mini");
    expect(body.data[0].object).toBe("model");
    expect(body.data[0].owned_by).toBe("openai");
  });

  it("aggregates models from multiple providers", async () => {
    const secondUpstream = await createMockUpstream();
    const multiGateway = await createGateway(getServerUrl(upstream), {
      extraProviders: [
        {
          name: "second-provider",
          baseUrl: getServerUrl(secondUpstream),
          apiKey: "sk-test-key-2",
          modelMappings: {},
          isDefault: false,
        },
      ],
    });

    const response = await multiGateway.inject({
      method: "GET",
      url: "/v1/models",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(4);

    const ids = body.data.map((m: { id: string }) => m.id);
    expect(ids).toContain("test-provider/gpt-4o");
    expect(ids).toContain("test-provider/gpt-4o-mini");
    expect(ids).toContain("second-provider/gpt-4o");
    expect(ids).toContain("second-provider/gpt-4o-mini");

    await multiGateway.close();
    await secondUpstream.close();
  });

  it("returns empty list when no providers configured", async () => {
    const emptyGateway = await createGateway(getServerUrl(upstream), {
      modelMappings: {},
    });

    const noProvidersGateway = await import("fastify").then((f) =>
      f.default({ logger: false }),
    );
    const { AppConfigSchema } = await import("../../src/config/index.js");
    const config = AppConfigSchema.parse({
      PORT: "3000",
      LOG_LEVEL: "silent",
      PROVIDERS: "[]",
    });
    noProvidersGateway.decorate("config", config);
    const { modelsPlugin } = await import("../../src/routes/v1/models.js");
    await noProvidersGateway.register(modelsPlugin);

    const response = await noProvidersGateway.inject({
      method: "GET",
      url: "/v1/models",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(0);

    await noProvidersGateway.close();
    await emptyGateway.close();
  });
});
