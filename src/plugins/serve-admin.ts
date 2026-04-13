import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyPluginCallback } from "fastify";
import fastifyStatic from "@fastify/static";

export const serveAdminPlugin: FastifyPluginCallback = async (server, _opts) => {
  const adminDistPath = resolve(process.cwd(), "admin", "dist");

  if (!existsSync(adminDistPath)) {
    return;
  }

  await server.register(fastifyStatic, {
    root: adminDistPath,
    prefix: "/admin/",
    wildcard: false,
    setHeaders(res, pathName) {
      if (pathName.includes("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  });

  server.get("/admin", async (_request, reply) => {
    return reply.type("text/html").sendFile("index.html");
  });

  server.get("/admin/*", async (request, reply) => {
    const fileParam = (request.params as Record<string, string>)["*"];
    if (fileParam) {
      const fullPath = resolve(adminDistPath, fileParam);
      if (fullPath.startsWith(adminDistPath) && existsSync(fullPath)) {
        return reply.sendFile(fileParam);
      }
    }
    return reply.type("text/html").sendFile("index.html");
  });
};
