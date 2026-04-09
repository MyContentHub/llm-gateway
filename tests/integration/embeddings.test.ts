import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createMockUpstream, createGateway, getServerUrl, CANNED_EMBEDDINGS_RESPONSE } from "../helpers/mock-upstream.js";

describe("Embeddings Integration", () => {
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

  it("forwards an embeddings request and returns the response", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        model: "gpt-4o",
        input: "Hello, world!",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");

    const body = response.json();
    expect(body.object).toBe("list");
    expect(body.data).toHaveLength(1);
    expect(body.data[0].object).toBe("embedding");
    expect(body.data[0].index).toBe(0);
    expect(body.data[0].embedding).toEqual([0.0023, -0.0094, 0.0156]);
    expect(body.usage.total_tokens).toBe(5);
  });

  it("returns 400 when model is missing", async () => {
    const response = await gateway.inject({
      method: "POST",
      url: "/v1/embeddings",
      payload: {
        input: "Hello, world!",
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.code).toBe("invalid_model");
  });
});
