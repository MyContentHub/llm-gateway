import { describe, it, expect } from "vitest";
import { createTestServer } from "../helpers/setup.js";

describe("OpenAPI Integration", () => {
  it("serves valid OpenAPI 3.0 spec at /reference/json", async () => {
    const { server, cleanup } = await createTestServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/docs/json",
      });

      expect(response.statusCode).toBe(200);
      const spec = JSON.parse(response.body);
      expect(spec.openapi).toBe("3.0.0");
      expect(spec.info.title).toBe("LLM Gateway API");
      expect(spec.info.version).toBe("1.0.0");
    } finally {
      await cleanup();
    }
  });

  it("defines VirtualKey and AdminToken security schemes", async () => {
    const { server, cleanup } = await createTestServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/docs/json",
      });

      const spec = JSON.parse(response.body);
      expect(spec.components.securitySchemes).toBeDefined();
      expect(spec.components.securitySchemes.VirtualKey).toEqual({
        type: "http",
        scheme: "bearer",
        description: "Virtual API key for /v1/* endpoints",
      });
      expect(spec.components.securitySchemes.AdminToken).toEqual({
        type: "http",
        scheme: "bearer",
        description: "Admin token for /admin/* endpoints",
      });
    } finally {
      await cleanup();
    }
  });

  it("documents the health endpoint", async () => {
    const { server, cleanup } = await createTestServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/docs/json",
      });

      const spec = JSON.parse(response.body);
      expect(spec.paths["/health"]).toBeDefined();
      expect(spec.paths["/health"].get).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("documents all v1 endpoints with VirtualKey security", async () => {
    const { server, cleanup } = await createTestServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/docs/json",
      });

      const spec = JSON.parse(response.body);

      const chatCompletions = spec.paths["/v1/chat/completions"];
      expect(chatCompletions).toBeDefined();
      expect(chatCompletions.post).toBeDefined();
      expect(chatCompletions.post.security).toEqual([{ VirtualKey: [] }]);
      expect(chatCompletions.post.tags).toContain("V1 - OpenAI Compatible");
      expect(chatCompletions.post.requestBody).toBeDefined();
      const requestBodySchema = chatCompletions.post.requestBody.content["application/json"].schema;
      expect(requestBodySchema.properties.model).toBeDefined();
      expect(requestBodySchema.properties.messages).toBeDefined();

      const embeddings = spec.paths["/v1/embeddings"];
      expect(embeddings).toBeDefined();
      expect(embeddings.post.security).toEqual([{ VirtualKey: [] }]);
      expect(embeddings.post.requestBody).toBeDefined();
      const embBodySchema = embeddings.post.requestBody.content["application/json"].schema;
      expect(embBodySchema.properties.model).toBeDefined();
      expect(embBodySchema.properties.input).toBeDefined();

      const models = spec.paths["/v1/models"];
      expect(models).toBeDefined();
      expect(models.get.security).toEqual([{ VirtualKey: [] }]);
    } finally {
      await cleanup();
    }
  });

  it("documents all admin key endpoints with AdminToken security", async () => {
    const { server, cleanup } = await createTestServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/docs/json",
      });

      const spec = JSON.parse(response.body);

      const postKeys = spec.paths["/admin/keys"].post;
      expect(postKeys).toBeDefined();
      expect(postKeys.security).toEqual([{ AdminToken: [] }]);
      expect(postKeys.tags).toContain("Admin - Key Management");
      expect(postKeys.requestBody).toBeDefined();

      const getKeys = spec.paths["/admin/keys"].get;
      expect(getKeys.security).toEqual([{ AdminToken: [] }]);
      expect(getKeys.parameters).toBeDefined();

      const getKey = spec.paths["/admin/keys/{id}"];
      expect(getKey).toBeDefined();
      expect(getKey.get.security).toEqual([{ AdminToken: [] }]);
      expect(getKey.delete.security).toEqual([{ AdminToken: [] }]);
      expect(getKey.patch.security).toEqual([{ AdminToken: [] }]);
    } finally {
      await cleanup();
    }
  });

  it("documents all admin audit endpoints with AdminToken security", async () => {
    const { server, cleanup } = await createTestServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/docs/json",
      });

      const spec = JSON.parse(response.body);

      const auditLogs = spec.paths["/admin/audit/logs"].get;
      expect(auditLogs).toBeDefined();
      expect(auditLogs.security).toEqual([{ AdminToken: [] }]);
      expect(auditLogs.tags).toContain("Admin - Audit");

      const auditLogById = spec.paths["/admin/audit/logs/{requestId}"];
      expect(auditLogById).toBeDefined();
      expect(auditLogById.get.security).toEqual([{ AdminToken: [] }]);

      const auditStats = spec.paths["/admin/audit/stats"].get;
      expect(auditStats).toBeDefined();
      expect(auditStats.security).toEqual([{ AdminToken: [] }]);
    } finally {
      await cleanup();
    }
  });

  it("serves Swagger UI at /docs", async () => {
    const { server, cleanup } = await createTestServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/docs",
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("swagger");
    } finally {
      await cleanup();
    }
  });

  it("documents all expected paths in the spec", async () => {
    const { server, cleanup } = await createTestServer();
    try {
      const response = await server.inject({
        method: "GET",
        url: "/docs/json",
      });

      const spec = JSON.parse(response.body);
      const paths = Object.keys(spec.paths);

      expect(paths).toContain("/health");
      expect(paths).toContain("/v1/chat/completions");
      expect(paths).toContain("/v1/embeddings");
      expect(paths).toContain("/v1/models");
      expect(paths).toContain("/admin/keys");
      expect(paths).toContain("/admin/keys/{id}");
      expect(paths).toContain("/admin/audit/logs");
      expect(paths).toContain("/admin/audit/logs/{requestId}");
      expect(paths).toContain("/admin/audit/stats");

      expect(paths.length).toBeGreaterThanOrEqual(9);
    } finally {
      await cleanup();
    }
  });
});
