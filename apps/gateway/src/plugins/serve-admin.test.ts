import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { serveAdminPlugin } from "./serve-admin.js";

describe("serve-admin plugin", () => {
  let app: Fastify.FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(serveAdminPlugin);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves index.html for /admin/ with Accept: text/html", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/",
      headers: { accept: "text/html" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("<!doctype");
  });

  it("serves index.html for SPA routes without Authorization", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/keys",
      headers: { accept: "text/html" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("serves static assets from admin/dist", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/assets/index-DY0WZrMU.js",
    });
    expect(res.statusCode).toBe(200);
  });

  it("does not intercept API requests with Authorization header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/keys",
      headers: {
        accept: "text/html",
        authorization: "Bearer token",
      },
    });
    expect(res.statusCode).toBe(404);
  });
});
