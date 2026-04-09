import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type Database from "better-sqlite3";

const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export interface MigrationRecord {
  id: number;
  name: string;
  applied_at: string;
}

export function getAppliedMigrations(db: Database.Database): MigrationRecord[] {
  return db.prepare("SELECT id, name, applied_at FROM migrations ORDER BY id").all() as MigrationRecord[];
}

export function getMigrationFiles(migrationsDir: string): Map<number, { name: string; path: string }> {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const map = new Map<number, { name: string; path: string }>();
  for (const file of files) {
    const match = file.match(/^(\d+)-(.+)\.sql$/);
    if (!match) {
      throw new Error(`Invalid migration filename: ${file}. Expected pattern: NNN-name.sql`);
    }
    const id = parseInt(match[1], 10);
    map.set(id, { name: file, path: join(migrationsDir, file) });
  }
  return map;
}

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  const resolvedDir = resolve(migrationsDir);

  db.exec(MIGRATIONS_TABLE_SQL);

  const applied = getAppliedMigrations(db);
  const appliedNames = new Set(applied.map((m) => m.name));

  const pending = getMigrationFiles(resolvedDir);

  const insertMigration = db.prepare("INSERT INTO migrations (id, name) VALUES (?, ?)");

  for (const [id, migration] of pending) {
    if (appliedNames.has(migration.name)) {
      continue;
    }

    const sql = readFileSync(migration.path, "utf-8");

    db.transaction(() => {
      db.exec(sql);
      insertMigration.run(id, migration.name);
    })();
  }
}
