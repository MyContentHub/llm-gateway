import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { KeyStore } from "./keys.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS virtual_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  rate_limits TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS upstream_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  encrypted_api_key TEXT NOT NULL,
  base_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const ENCRYPTION_KEY = "test-master-key-for-encryption-32b";
const DEFAULT_LIMITS = { rpm: 60, tpm: 100000, rpd: 1000 };

describe("KeyStore", () => {
  let db: Database.Database;
  let store: KeyStore;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    store = new KeyStore(db, ENCRYPTION_KEY);
  });

  describe("createKey", () => {
    it("generates gwk_ prefixed key, stores hash, returns plaintext", async () => {
      const result = await store.createKey({ name: "test-key", rateLimits: DEFAULT_LIMITS });

      expect(result.key).toMatch(/^gwk_[0-9a-f]{32}$/);
      expect(result.id).toMatch(/^[0-9a-f]{32}$/);
      expect(result.name).toBe("test-key");
      expect(result.createdAt).toBeTruthy();

      const row = db.prepare("SELECT key_hash, name FROM virtual_keys WHERE id = ?").get(result.id) as { key_hash: string; name: string };
      expect(row.key_hash).toBeTruthy();
      expect(row.key_hash).not.toBe(result.key);
      expect(row.name).toBe("test-key");
    });

    it("stores rate limits as JSON", async () => {
      const result = await store.createKey({ name: "rl-key", rateLimits: DEFAULT_LIMITS });

      const row = db.prepare("SELECT rate_limits FROM virtual_keys WHERE id = ?").get(result.id) as { rate_limits: string };
      expect(JSON.parse(row.rate_limits)).toEqual(DEFAULT_LIMITS);
    });
  });

  describe("getKeyById", () => {
    it("returns correct key data", async () => {
      const created = await store.createKey({ name: "lookup-key", rateLimits: DEFAULT_LIMITS });

      const key = store.getKeyById(created.id);

      expect(key).not.toBeNull();
      expect(key!.id).toBe(created.id);
      expect(key!.name).toBe("lookup-key");
      expect(key!.rateLimits).toEqual(DEFAULT_LIMITS);
      expect(key!.createdAt).toBeTruthy();
      expect(key!.revokedAt).toBeNull();
    });

    it("returns null for nonexistent key", () => {
      const key = store.getKeyById("does-not-exist");
      expect(key).toBeNull();
    });
  });

  describe("listKeys", () => {
    it("returns paginated results", async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const result = await store.createKey({ name: `key-${i}`, rateLimits: DEFAULT_LIMITS });
        ids.push(result.id);
      }

      const page1 = store.listKeys(0, 2);
      expect(page1.keys).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = store.listKeys(2, 2);
      expect(page2.keys).toHaveLength(2);

      const page3 = store.listKeys(4, 2);
      expect(page3.keys).toHaveLength(1);

      const allIds = [...page1.keys, ...page2.keys, ...page3.keys].map((k) => k.id);
      expect(new Set(allIds).size).toBe(5);
    });

    it("returns empty list when no keys exist", () => {
      const result = store.listKeys(0, 10);
      expect(result.keys).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe("revokeKey", () => {
    it("sets revoked_at and subsequent getKeyById shows revoked", async () => {
      const created = await store.createKey({ name: "revoke-me", rateLimits: DEFAULT_LIMITS });

      const revoked = store.revokeKey(created.id);
      expect(revoked).toBe(true);

      const key = store.getKeyById(created.id);
      expect(key!.revokedAt).not.toBeNull();
    });

    it("returns false for nonexistent key", () => {
      const revoked = store.revokeKey("does-not-exist");
      expect(revoked).toBe(false);
    });

    it("returns false if already revoked", async () => {
      const created = await store.createKey({ name: "double-revoke", rateLimits: DEFAULT_LIMITS });

      expect(store.revokeKey(created.id)).toBe(true);
      expect(store.revokeKey(created.id)).toBe(false);
    });
  });

  describe("updateRateLimits", () => {
    it("updates rate limits and invalidates cache", async () => {
      const created = await store.createKey({ name: "update-rl", rateLimits: DEFAULT_LIMITS });

      store.getKeyById(created.id);

      const newLimits = { rpm: 120, tpm: 200000, rpd: 2000 };
      const updated = store.updateRateLimits(created.id, newLimits);
      expect(updated).toBe(true);

      const key = store.getKeyById(created.id);
      expect(key!.rateLimits).toEqual(newLimits);
    });

    it("returns false for nonexistent key", () => {
      const updated = store.updateRateLimits("does-not-exist", DEFAULT_LIMITS);
      expect(updated).toBe(false);
    });
  });

  describe("upstream provider", () => {
    it("encrypts and decrypts provider API key roundtrip", () => {
      store.storeUpstreamProvider("openai", "sk-secret-key-12345", "https://api.openai.com/v1");

      const provider = store.getUpstreamProvider("openai");
      expect(provider).not.toBeNull();
      expect(provider!.name).toBe("openai");
      expect(provider!.apiKey).toBe("sk-secret-key-12345");
      expect(provider!.baseUrl).toBe("https://api.openai.com/v1");
    });

    it("returns null for nonexistent provider", () => {
      const provider = store.getUpstreamProvider("nonexistent");
      expect(provider).toBeNull();
    });

    it("stores encrypted key different from plaintext", () => {
      store.storeUpstreamProvider("anthropic", "sk-ant-key-67890", "https://api.anthropic.com");

      const row = db.prepare("SELECT encrypted_api_key FROM upstream_providers WHERE name = ?").get("anthropic") as { encrypted_api_key: string };
      expect(row.encrypted_api_key).not.toBe("sk-ant-key-67890");
    });
  });

  describe("cache", () => {
    it("serves second getKeyById from cache", async () => {
      const created = await store.createKey({ name: "cached-key", rateLimits: DEFAULT_LIMITS });

      const first = store.getKeyById(created.id);
      expect(first).not.toBeNull();

      db.prepare("UPDATE virtual_keys SET name = 'modified-behind-cache' WHERE id = ?").run(created.id);

      const second = store.getKeyById(created.id);
      expect(second!.name).toBe("cached-key");
    });

    it("invalidates cache on revoke", async () => {
      const created = await store.createKey({ name: "cache-invalidate", rateLimits: DEFAULT_LIMITS });

      store.getKeyById(created.id);
      store.revokeKey(created.id);

      const key = store.getKeyById(created.id);
      expect(key!.revokedAt).not.toBeNull();
    });

    it("invalidates cache on updateRateLimits", async () => {
      const created = await store.createKey({ name: "cache-update", rateLimits: DEFAULT_LIMITS });

      store.getKeyById(created.id);
      const newLimits = { rpm: 999, tpm: 999, rpd: 999 };
      store.updateRateLimits(created.id, newLimits);

      const key = store.getKeyById(created.id);
      expect(key!.rateLimits).toEqual(newLimits);
    });

    it("expires entries after TTL", async () => {
      const shortTtlStore = new KeyStore(db, ENCRYPTION_KEY, 5);
      const created = await store.createKey({ name: "ttl-key", rateLimits: DEFAULT_LIMITS });

      shortTtlStore.getKeyById(created.id);

      await new Promise((resolve) => setTimeout(resolve, 20));

      db.prepare("UPDATE virtual_keys SET name = 'post-ttl' WHERE id = ?").run(created.id);

      const expired = shortTtlStore.getKeyById(created.id);
      expect(expired!.name).toBe("post-ttl");
    });
  });
});
