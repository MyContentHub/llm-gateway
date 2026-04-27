import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import http from "node:http";
import { setupGracefulShutdown } from "../../src/graceful-shutdown.js";

function httpRequest(
  url: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "GET",
        headers: { connection: "close" },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode ?? 200, body }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("Graceful Shutdown Integration", () => {
  it("completes in-flight request when server.close() is called", async () => {
    let requestCompleted = false;
    const server = Fastify({ logger: false });

    server.get("/slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      requestCompleted = true;
      return { status: "done" };
    });

    await server.listen({ port: 0, host: "127.0.0.1" });
    const addr = server.addresses()[0];
    const url = `http://${addr.address}:${addr.port}`;

    const responsePromise = httpRequest(`${url}/slow`);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const closePromise = server.close();
    const response = await responsePromise;

    expect(response.statusCode).toBe(200);
    expect(requestCompleted).toBe(true);
    expect(JSON.parse(response.body).status).toBe("done");
    await closePromise;
  });

  it("completes multiple concurrent in-flight requests before closing", async () => {
    const completed: number[] = [];
    const server = Fastify({ logger: false });

    server.get("/delay/:id", async (request) => {
      const { id } = request.params as { id: string };
      const numId = parseInt(id, 10);
      await new Promise((resolve) => setTimeout(resolve, numId * 20));
      completed.push(numId);
      return { id: numId };
    });

    await server.listen({ port: 0, host: "127.0.0.1" });
    const addr = server.addresses()[0];
    const url = `http://${addr.address}:${addr.port}`;

    const promises = [
      httpRequest(`${url}/delay/1`),
      httpRequest(`${url}/delay/2`),
    ];

    await new Promise((resolve) => setTimeout(resolve, 10));
    const closePromise = server.close();

    const results = await Promise.all(promises);
    for (const r of results) expect(r.statusCode).toBe(200);
    expect(completed.sort()).toEqual([1, 2]);
    await closePromise;
  });

  it("rejects new connections after server.close()", async () => {
    const server = Fastify({ logger: false });
    server.get("/test", async () => ({ ok: true }));

    await server.listen({ port: 0, host: "127.0.0.1" });
    const addr = server.addresses()[0];
    const url = `http://${addr.address}:${addr.port}`;

    const res = await httpRequest(`${url}/test`);
    expect(res.statusCode).toBe(200);

    await server.close();
    await expect(httpRequest(`${url}/test`)).rejects.toThrow();
  });

  it("server.close() resolves immediately with no active connections", async () => {
    const server = Fastify({ logger: false });
    server.get("/ping", async () => "pong");
    await server.listen({ port: 0, host: "127.0.0.1" });

    const start = Date.now();
    await server.close();
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("setupGracefulShutdown registers process signal handlers", () => {
    const server = Fastify({ logger: false });
    const noop = () => {};

    const before = {
      sigterm: process.listenerCount("SIGTERM"),
      sigint: process.listenerCount("SIGINT"),
      uncaught: process.listenerCount("uncaughtException"),
      unhandled: process.listenerCount("unhandledRejection"),
    };

    setupGracefulShutdown(server, {
      timeoutMs: 5000,
      logger: { info: noop, error: noop },
    });

    expect(process.listenerCount("SIGTERM")).toBe(before.sigterm + 1);
    expect(process.listenerCount("SIGINT")).toBe(before.sigint + 1);
    expect(process.listenerCount("uncaughtException")).toBe(before.uncaught + 1);
    expect(process.listenerCount("unhandledRejection")).toBe(before.unhandled + 1);

    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");

    server.close();
  });

  it("setupGracefulShutdown accepts custom logger and timeout", () => {
    const server = Fastify({ logger: false });
    const logs: string[] = [];

    setupGracefulShutdown(server, {
      timeoutMs: 100,
      logger: {
        info: (...args: unknown[]) => logs.push(`info:${args.join("")}`),
        error: (...args: unknown[]) => logs.push(`error:${args.join("")}`),
      },
    });

    expect(logs.length).toBe(0);

    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");

    server.close();
  });
});
