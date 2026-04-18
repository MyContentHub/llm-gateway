import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import {
  generateApiKey,
  hashApiKey,
  encryptAes256Gcm,
  decryptAes256Gcm,
} from "../utils/crypto.js";

export interface RateLimits {
  rpm: number;
  tpm: number;
  rpd: number;
}

export interface VirtualKeyData {
  id: string;
  name: string;
  rateLimits: RateLimits;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreateKeyInput {
  name: string;
  rateLimits: RateLimits;
}

export interface CreateKeyResult {
  id: string;
  key: string;
  name: string;
  createdAt: string;
}

interface CacheEntry {
  data: VirtualKeyData;
  expiresAt: number;
}

interface VirtualKeyRow {
  id: string;
  name: string;
  rate_limits: string;
  created_at: string;
  revoked_at: string | null;
}

interface UpstreamProviderRow {
  id: string;
  name: string;
  encrypted_api_key: string;
  base_url: string;
  created_at: string;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 1000;

export class KeyStore {
  private db: Database.Database;
  private encryptionKey: string;
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  private stmtInsertKey: Database.Statement;
  private stmtGetKeyById: Database.Statement;
  private stmtCountKeys: Database.Statement;
  private stmtListKeys: Database.Statement;
  private stmtRevokeKey: Database.Statement;
  private stmtUpdateRateLimits: Database.Statement;
  private stmtInsertProvider: Database.Statement;
  private stmtGetProvider: Database.Statement;

  constructor(db: Database.Database, encryptionKey: string, ttlMs?: number) {
    this.db = db;
    this.encryptionKey = encryptionKey;
    this.ttlMs = ttlMs ?? DEFAULT_TTL_MS;

    this.stmtInsertKey = db.prepare(
      "INSERT INTO virtual_keys (id, name, key_hash, rate_limits) VALUES (?, ?, ?, ?)"
    );
    this.stmtGetKeyById = db.prepare(
      "SELECT id, name, rate_limits, created_at, revoked_at FROM virtual_keys WHERE id = ?"
    );
    this.stmtCountKeys = db.prepare(
      "SELECT COUNT(*) as total FROM virtual_keys"
    );
    this.stmtListKeys = db.prepare(
      "SELECT id, name, rate_limits, created_at, revoked_at FROM virtual_keys ORDER BY created_at DESC LIMIT ? OFFSET ?"
    );
    this.stmtRevokeKey = db.prepare(
      "UPDATE virtual_keys SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL"
    );
    this.stmtUpdateRateLimits = db.prepare(
      "UPDATE virtual_keys SET rate_limits = ? WHERE id = ?"
    );
    this.stmtInsertProvider = db.prepare(
      "INSERT INTO upstream_providers (id, name, encrypted_api_key, base_url) VALUES (?, ?, ?, ?)"
    );
    this.stmtGetProvider = db.prepare(
      "SELECT id, name, encrypted_api_key, base_url, created_at FROM upstream_providers WHERE name = ?"
    );
  }

  private pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private setCache(id: string, data: VirtualKeyData): void {
    this.pruneCache();
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(id, { data, expiresAt: Date.now() + this.ttlMs });
  }

  private rowToData(row: VirtualKeyRow): VirtualKeyData {
    return {
      id: row.id,
      name: row.name,
      rateLimits: JSON.parse(row.rate_limits),
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
    };
  }

  async createKey(input: CreateKeyInput): Promise<CreateKeyResult> {
    const id = randomBytes(16).toString("hex");
    const key = generateApiKey();
    const hash = await hashApiKey(key);

    this.stmtInsertKey.run(id, input.name, hash, JSON.stringify(input.rateLimits));

    const row = this.stmtGetKeyById.get(id) as VirtualKeyRow | undefined;

    return {
      id,
      key,
      name: input.name,
      createdAt: row?.created_at ?? new Date().toISOString(),
    };
  }

  getKeyById(id: string): VirtualKeyData | null {
    this.pruneCache();

    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    this.cache.delete(id);

    const row = this.stmtGetKeyById.get(id) as VirtualKeyRow | undefined;
    if (!row) {
      return null;
    }

    const data = this.rowToData(row);
    this.setCache(id, data);
    return data;
  }

  listKeys(offset: number, limit: number): { keys: VirtualKeyData[]; total: number } {
    const countRow = this.stmtCountKeys.get() as { total: number };
    const rows = this.stmtListKeys.all(limit, offset) as VirtualKeyRow[];
    return {
      keys: rows.map((row) => this.rowToData(row)),
      total: countRow.total,
    };
  }

  revokeKey(id: string): boolean {
    const result = this.stmtRevokeKey.run(id);
    if (result.changes > 0) {
      this.cache.delete(id);
      return true;
    }
    return false;
  }

  updateRateLimits(id: string, limits: RateLimits): boolean {
    const result = this.stmtUpdateRateLimits.run(JSON.stringify(limits), id);
    if (result.changes > 0) {
      this.cache.delete(id);
      return true;
    }
    return false;
  }

  storeUpstreamProvider(name: string, apiKey: string, baseUrl: string): void {
    const id = randomBytes(16).toString("hex");
    const encrypted = encryptAes256Gcm(apiKey, this.encryptionKey);
    this.stmtInsertProvider.run(id, name, encrypted, baseUrl);
  }

  getUpstreamProvider(name: string): { id: string; name: string; apiKey: string; baseUrl: string } | null {
    const row = this.stmtGetProvider.get(name) as UpstreamProviderRow | undefined;
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      name: row.name,
      apiKey: decryptAes256Gcm(row.encrypted_api_key, this.encryptionKey),
      baseUrl: row.base_url,
    };
  }
}
