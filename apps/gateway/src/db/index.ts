import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import fp from "fastify-plugin";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations.js";
import type { FastifyPluginAsync } from "fastify";

export interface DbPluginOptions {
  databasePath: string;
  migrationsDir?: string;
}

export const dbPlugin: FastifyPluginAsync<DbPluginOptions> = async (fastify, options) => {
  const dbPath = resolve(options.databasePath);
  const migrationsDir = options.migrationsDir ?? resolve(import.meta.dirname, "../../migrations");

  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  try {
    runMigrations(db, migrationsDir);
  } catch (err) {
    db.close();
    throw err;
  }

  fastify.decorate("db", db);

  fastify.addHook("onClose", () => {
    db.close();
  });
};

export default fp(dbPlugin, { name: "db", encapsulate: false });
