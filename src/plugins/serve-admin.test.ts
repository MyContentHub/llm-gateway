import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import http from "node:http";
import { serveAdminPlugin } from "./serve-admin.js";

let forceNoAdminDist = false;

vi.mock("node:fs", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:fs")>();
  return {
    ...mod,
    existsSync: (...args: Parameters<typeof mod.existsSync>) => {
      if (forceNoAdminDist) return false;
      return mod.existsSync(...args);
    },
  };
});

function startMockVite(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(handler);
    srv.on("error", reject);
    srv.listen(5173, () => {
      srv.removeListener("error", reject);
      resolve(srv);
    });
  });
}

function stopServer(srv: http.Server): Promise<void> {
  return new Promise((res) => srv.close(() => res()));
}

function defaultViteHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  let body = "";
  req.on("data", (c: Buffer) => {
    body += c.toString();
  });
  req.on("end", () => {
    if (req.url === "/admin/echo") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ method: req.method, body }));
      return;
    }
    if (req.url?.startsWith("/admin/assets/")) {
      res.writeHead(200, { "Content-Type": "application/javascript" });
      res.end('console.log("mock-asset");');
      return;
    }
    if (req.url?.startsWith("/admin")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>vite-mock</body></html>");
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
}

describe("serve-admin plugin", () => {
  describe("dev proxy mode (Vite running)", () => {
    let app: Fastify.FastifyInstance;
    let vite: http.Server;

    beforeEach(async () => {
      forceNoAdminDist = true;
      vite = await startMockVite(defaultViteHandler);
      app = Fastify({ logger: false });
      await app.register(serveAdminPlugin);
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
      await stopServer(vite);
      forceNoAdminDist = false;
    });

    it("proxies /admin/ and returns HTML from Vite", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/" });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("vite-mock");
      expect(res.headers["content-type"]).toContain("text/html");
    });

    it("proxies /admin/assets/main.js", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/admin/assets/main.js",
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("mock-asset");
      expect(res.headers["content-type"]).toContain("application/javascript");
    });

    it("does NOT proxy /admin/keys (API route)", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/keys" });
      expect(res.statusCode).toBe(404);
    });

    it("does NOT proxy /admin/audit/logs (API route)", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/audit/logs" });
      expect(res.statusCode).toBe(404);
    });

    it("does NOT proxy /admin/config (API route)", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/config" });
      expect(res.statusCode).toBe(404);
    });

    it("does NOT proxy /admin/providers (API route)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/admin/providers",
      });
      expect(res.statusCode).toBe(404);
    });

    it("does NOT proxy non-admin routes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/v1/chat/completions",
      });
      expect(res.statusCode).toBe(404);
    });

    it("forwards POST method and body to Vite", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/echo",
        payload: { data: "hello" },
      });
      expect(res.statusCode).toBe(200);
      const echoed = res.json();
      expect(echoed.method).toBe("POST");
      expect(echoed.body).toBe(JSON.stringify({ data: "hello" }));
    });
  });

  describe("dev proxy mode (Vite not running)", () => {
    let app: Fastify.FastifyInstance;

    beforeEach(async () => {
      forceNoAdminDist = true;
      app = Fastify({ logger: false });
      await app.register(serveAdminPlugin);
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
      forceNoAdminDist = false;
    });

    it("returns 502 when Vite dev server is unreachable", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/" });
      expect(res.statusCode).toBe(502);
      const body = res.json();
      expect(body.error).toBe("Vite dev server not reachable");
      expect(body.message).toContain("pnpm dev");
    });
  });

  describe("static mode (admin/dist present)", () => {
    let app: Fastify.FastifyInstance;

    beforeEach(async () => {
      forceNoAdminDist = false;
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
});
