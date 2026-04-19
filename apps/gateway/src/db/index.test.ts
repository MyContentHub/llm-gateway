import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { runMigrations, getAppliedMigrations, getMigrationFiles } from "./migrations.js";
import dbPlugin from "./index.js";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../migrations");

describe("db migrations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates all tables from 001-init.sql", () => {
    runMigrations(db, MIGRATIONS_DIR);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain("migrations");
    expect(tables).toContain("virtual_keys");
    expect(tables).toContain("upstream_providers");
    expect(tables).toContain("audit_logs");
  });

  it("records applied migration in migrations table", () => {
    runMigrations(db, MIGRATIONS_DIR);

    const applied = getAppliedMigrations(db);
    expect(applied).toHaveLength(2);
    expect(applied[0].name).toBe("001-init.sql");
    expect(applied[0].id).toBe(1);
    expect(applied[1].name).toBe("002-add-audit-body.sql");
    expect(applied[1].id).toBe(2);
  });

  it("is idempotent — does not re-run migrations", () => {
    runMigrations(db, MIGRATIONS_DIR);
    runMigrations(db, MIGRATIONS_DIR);

    const applied = getAppliedMigrations(db);
    expect(applied).toHaveLength(2);
  });

  it("parses migration files correctly", () => {
    const files = getMigrationFiles(MIGRATIONS_DIR);
    expect(files.has(1)).toBe(true);
    expect(files.get(1)!.name).toBe("001-init.sql");
    expect(files.has(2)).toBe(true);
    expect(files.get(2)!.name).toBe("002-add-audit-body.sql");
  });
});

describe("db plugin", () => {
  let fastify: Fastify.FastifyInstance;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "llm-gateway-test-"));
    fastify = Fastify();
  });

  afterEach(async () => {
    await fastify.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("decorates fastify with db", async () => {
    await fastify.register(dbPlugin, {
      databasePath: join(tempDir, "test.db"),
      migrationsDir: MIGRATIONS_DIR,
    });

    expect(fastify.db).toBeDefined();
    expect(typeof fastify.db.prepare).toBe("function");
  });

  it("creates tables via plugin", async () => {
    await fastify.register(dbPlugin, {
      databasePath: join(tempDir, "test.db"),
      migrationsDir: MIGRATIONS_DIR,
    });

    const tables = fastify.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain("migrations");
    expect(tables).toContain("virtual_keys");
    expect(tables).toContain("upstream_providers");
    expect(tables).toContain("audit_logs");
  });

  it("allows basic CRUD on virtual_keys", async () => {
    await fastify.register(dbPlugin, {
      databasePath: join(tempDir, "test.db"),
      migrationsDir: MIGRATIONS_DIR,
    });

    fastify.db
      .prepare("INSERT INTO virtual_keys (id, name, key_hash) VALUES (?, ?, ?)")
      .run("key-1", "test-key", "hash123");

    const row = fastify.db
      .prepare("SELECT * FROM virtual_keys WHERE id = ?")
      .get("key-1") as any;

    expect(row).toBeDefined();
    expect(row.name).toBe("test-key");
    expect(row.key_hash).toBe("hash123");
    expect(row.created_at).toBeTruthy();
    expect(row.revoked_at).toBeNull();
  });

  it("allows basic CRUD on audit_logs", async () => {
    await fastify.register(dbPlugin, {
      databasePath: join(tempDir, "test.db"),
      migrationsDir: MIGRATIONS_DIR,
    });

    fastify.db
      .prepare(
        "INSERT INTO audit_logs (request_id, timestamp, model, endpoint, status) VALUES (?, ?, ?, ?, ?)"
      )
      .run("req-1", "2026-01-01T00:00:00Z", "gpt-4", "/v1/chat/completions", "success");

    const row = fastify.db
      .prepare("SELECT * FROM audit_logs WHERE request_id = ?")
      .get("req-1") as any;

    expect(row).toBeDefined();
    expect(row.request_id).toBe("req-1");
    expect(row.model).toBe("gpt-4");
    expect(row.prompt_tokens).toBe(0);
    expect(row.cost_usd).toBe(0);
  });

  it("throws on invalid migration SQL", async () => {
    const invalidDir = mkdtempSync(join(tmpdir(), "llm-invalid-"));
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(invalidDir, "002-bad.sql"), "INVALID SQL HERE;");

    try {
      await fastify.register(dbPlugin, {
        databasePath: join(tempDir, "test.db"),
        migrationsDir: invalidDir,
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err).toBeDefined();
    } finally {
      rmSync(invalidDir, { recursive: true, force: true });
    }
  });
});
