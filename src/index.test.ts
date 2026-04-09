import { describe, it, expect } from "vitest";
import Fastify from "fastify";

describe("health check", () => {
  it("returns ok status", async () => {
    const server = Fastify();
    server.get("/health", async () => ({ status: "ok" }));

    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await server.close();
  });
});
