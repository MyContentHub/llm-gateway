import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import net from "node:net";
import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import fastifyStatic from "@fastify/static";

const VITE_PORT = 5173;
const VITE_HOST = "localhost";
const VITE_ORIGIN = `http://${VITE_HOST}:${VITE_PORT}`;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
]);

function readRawBody(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

const serveAdminPlugin: FastifyPluginCallback = async (server, _opts) => {
  const adminDistPath = resolve(process.cwd(), "admin", "dist");

  if (!existsSync(adminDistPath)) {
    server.addHook("onRequest", async (request, reply) => {
      if (!request.url.startsWith("/admin")) return;
      if (request.url.startsWith("/api")) return;

      const targetUrl = new URL(request.url, VITE_ORIGIN);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        const lower = key.toLowerCase();
        if (lower === "host" || HOP_BY_HOP.has(lower)) continue;
        headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      headers.set("host", `${VITE_HOST}:${VITE_PORT}`);

      const init: RequestInit = { method: request.method, headers };

      if (request.method !== "GET" && request.method !== "HEAD") {
        const body = await readRawBody(request.raw);
        if (body.length > 0) {
          init.body = body;
        }
      }

      try {
        const response = await fetch(targetUrl, init);
        reply.code(response.status);
        response.headers.forEach((value, key) => {
          const lower = key.toLowerCase();
          if (HOP_BY_HOP.has(lower) || lower === "content-length" || lower === "content-encoding") return;
          reply.header(key, value);
        });
        reply.send(Buffer.from(await response.arrayBuffer()));
        return reply;
      } catch {
        reply.code(502).send({
          error: "Vite dev server not reachable",
          message: "Start the Vite dev server: cd admin && pnpm dev",
        });
        return reply;
      }
    });

    server.server.on("upgrade", (req, socket, head) => {
      if (!req.url?.startsWith("/admin")) return;
      if (req.url.startsWith("/api")) return;

      const vite = net.connect(VITE_PORT, VITE_HOST, () => {
        let raw = `GET ${req.url} HTTP/1.1\r\nHost: ${VITE_HOST}:${VITE_PORT}\r\n`;
        for (const [key, value] of Object.entries(req.headers)) {
          if (value !== undefined && key.toLowerCase() !== "host") {
            raw += `${key}: ${Array.isArray(value) ? value.join(", ") : value}\r\n`;
          }
        }
        raw += "\r\n";
        vite.write(raw);
        if (head.length > 0) vite.write(head);
      });

      socket.pipe(vite);
      vite.pipe(socket);
      vite.on("error", () => socket.destroy());
      socket.on("error", () => vite.destroy());
    });

    return;
  }

  let indexHtml: string | null = null;

  const getIndexHtml = () => {
    if (!indexHtml) {
      indexHtml = readFileSync(resolve(adminDistPath, "index.html"), "utf-8");
    }
    return indexHtml;
  };

  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/admin")) return;
    if (request.headers.authorization) return;
    const accept = request.headers.accept ?? "";
    if (!accept.includes("text/html")) return;

    reply.type("text/html; charset=utf-8");
    reply.send(getIndexHtml());
    return reply;
  });

  await server.register(fastifyStatic, {
    root: adminDistPath,
    prefix: "/admin/",
    wildcard: false,
    decorateReply: false,
    setHeaders(res, pathName) {
      if (pathName.includes("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });
};

export default fp(serveAdminPlugin);
export { serveAdminPlugin };
