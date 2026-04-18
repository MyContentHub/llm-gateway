import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import fastifyStatic from "@fastify/static";

const serveAdminPlugin: FastifyPluginCallback = async (server, _opts) => {
  const adminDistPath = resolve(process.cwd(), "admin", "dist");

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
