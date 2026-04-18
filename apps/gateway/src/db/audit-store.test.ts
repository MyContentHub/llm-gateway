import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { AuditStore, type AuditLogEntry } from "./audit-store.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  api_key_id TEXT,
  model TEXT,
  endpoint TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success',
  pii_detected INTEGER DEFAULT 0,
  pii_types_found TEXT,
  prompt_injection_score REAL DEFAULT 0,
  content_hash_sha256 TEXT
);
`;

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    request_id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    api_key_id: "key-001",
    model: "gpt-4",
    endpoint: "/api/v1/chat/completions",
    prompt_tokens: 100,
    completion_tokens: 50,
    cost_usd: 0.003,
    latency_ms: 1200,
    status: "success",
    pii_detected: false,
    pii_types_found: null,
    prompt_injection_score: 0.0,
    content_hash_sha256: "abc123hash",
    ...overrides,
  };
}

describe("AuditStore", () => {
  let db: Database.Database;
  let store: AuditStore;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
    store = new AuditStore(db);
  });

  describe("insertAuditLog", () => {
    it("persists a record with all fields", () => {
      const entry = makeEntry();

      store.insertAuditLog(entry);

      const row = store.getAuditLogById(entry.request_id);
      expect(row).not.toBeNull();
      expect(row!.request_id).toBe(entry.request_id);
      expect(row!.timestamp).toBe(entry.timestamp);
      expect(row!.api_key_id).toBe("key-001");
      expect(row!.model).toBe("gpt-4");
      expect(row!.endpoint).toBe("/api/v1/chat/completions");
      expect(row!.prompt_tokens).toBe(100);
      expect(row!.completion_tokens).toBe(50);
      expect(row!.cost_usd).toBeCloseTo(0.003);
      expect(row!.latency_ms).toBe(1200);
      expect(row!.status).toBe("success");
      expect(row!.pii_detected).toBe(0);
      expect(row!.pii_types_found).toBeNull();
      expect(row!.prompt_injection_score).toBe(0);
      expect(row!.content_hash_sha256).toBe("abc123hash");
    });

    it("persists record with pii_detected=true as 1", () => {
      const entry = makeEntry({
        pii_detected: true,
        pii_types_found: JSON.stringify(["email", "phone"]),
      });

      store.insertAuditLog(entry);

      const row = store.getAuditLogById(entry.request_id);
      expect(row!.pii_detected).toBe(1);
      expect(JSON.parse(row!.pii_types_found!)).toEqual(["email", "phone"]);
    });

    it("persists record with error status", () => {
      const entry = makeEntry({
        status: "error",
        prompt_tokens: 0,
        completion_tokens: 0,
        cost_usd: 0,
        latency_ms: 50,
      });

      store.insertAuditLog(entry);

      const row = store.getAuditLogById(entry.request_id);
      expect(row!.status).toBe("error");
    });

    it("uses defaults for optional fields", () => {
      const entry: AuditLogEntry = {
        request_id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };

      store.insertAuditLog(entry);

      const row = store.getAuditLogById(entry.request_id);
      expect(row).not.toBeNull();
      expect(row!.api_key_id).toBeNull();
      expect(row!.model).toBeNull();
      expect(row!.endpoint).toBeNull();
      expect(row!.prompt_tokens).toBe(0);
      expect(row!.completion_tokens).toBe(0);
      expect(row!.cost_usd).toBe(0);
      expect(row!.latency_ms).toBe(0);
      expect(row!.status).toBe("success");
      expect(row!.pii_detected).toBe(0);
      expect(row!.pii_types_found).toBeNull();
      expect(row!.prompt_injection_score).toBe(0);
      expect(row!.content_hash_sha256).toBeNull();
    });
  });

  describe("getAuditLogById", () => {
    it("returns null for nonexistent request_id", () => {
      const row = store.getAuditLogById("does-not-exist");
      expect(row).toBeNull();
    });

    it("returns the correct record by request_id", () => {
      const id1 = crypto.randomUUID();
      const id2 = crypto.randomUUID();
      store.insertAuditLog(makeEntry({ request_id: id1 }));
      store.insertAuditLog(makeEntry({ request_id: id2 }));

      const row = store.getAuditLogById(id2);
      expect(row!.request_id).toBe(id2);
    });
  });

  describe("queryAuditLogs", () => {
    beforeEach(() => {
      store.insertAuditLog(makeEntry({
        request_id: "r1",
        timestamp: "2025-01-01T10:00:00.000Z",
        api_key_id: "key-A",
        model: "gpt-4",
        endpoint: "/api/v1/chat/completions",
        status: "success",
      }));
      store.insertAuditLog(makeEntry({
        request_id: "r2",
        timestamp: "2025-01-02T10:00:00.000Z",
        api_key_id: "key-B",
        model: "gpt-3.5-turbo",
        endpoint: "/api/v1/chat/completions",
        status: "success",
      }));
      store.insertAuditLog(makeEntry({
        request_id: "r3",
        timestamp: "2025-01-03T10:00:00.000Z",
        api_key_id: "key-A",
        model: "gpt-4",
        endpoint: "/api/v1/embeddings",
        status: "error",
      }));
      store.insertAuditLog(makeEntry({
        request_id: "r4",
        timestamp: "2025-01-04T10:00:00.000Z",
        api_key_id: "key-B",
        model: "gpt-3.5-turbo",
        endpoint: "/api/v1/completions",
        status: "success",
      }));
      store.insertAuditLog(makeEntry({
        request_id: "r5",
        timestamp: "2025-01-05T10:00:00.000Z",
        api_key_id: "key-A",
        model: "claude-3",
        endpoint: "/api/v1/chat/completions",
        status: "error",
      }));
    });

    it("returns all records with no filters", () => {
      const result = store.queryAuditLogs({});
      expect(result.total).toBe(5);
      expect(result.rows).toHaveLength(5);
    });

    it("filters by date range", () => {
      const result = store.queryAuditLogs({
        startDate: "2025-01-02T00:00:00.000Z",
        endDate: "2025-01-04T23:59:59.000Z",
      });
      expect(result.total).toBe(3);
      const ids = result.rows.map((r) => r.request_id);
      expect(ids).toContain("r2");
      expect(ids).toContain("r3");
      expect(ids).toContain("r4");
    });

    it("filters by model", () => {
      const result = store.queryAuditLogs({ model: "gpt-4" });
      expect(result.total).toBe(2);
      expect(result.rows.every((r) => r.model === "gpt-4")).toBe(true);
    });

    it("filters by api_key_id", () => {
      const result = store.queryAuditLogs({ api_key_id: "key-B" });
      expect(result.total).toBe(2);
      expect(result.rows.every((r) => r.api_key_id === "key-B")).toBe(true);
    });

    it("filters by endpoint", () => {
      const result = store.queryAuditLogs({ endpoint: "/api/v1/embeddings" });
      expect(result.total).toBe(1);
      expect(result.rows[0].request_id).toBe("r3");
    });

    it("filters by status", () => {
      const result = store.queryAuditLogs({ status: "error" });
      expect(result.total).toBe(2);
      expect(result.rows.every((r) => r.status === "error")).toBe(true);
    });

    it("combines multiple filters", () => {
      const result = store.queryAuditLogs({
        api_key_id: "key-A",
        status: "error",
        model: "gpt-4",
      });
      expect(result.total).toBe(1);
      expect(result.rows[0].request_id).toBe("r3");
    });

    it("combines all filter types", () => {
      const result = store.queryAuditLogs({
        startDate: "2025-01-01T00:00:00.000Z",
        endDate: "2025-01-05T23:59:59.000Z",
        model: "gpt-4",
        api_key_id: "key-A",
        endpoint: "/api/v1/chat/completions",
        status: "success",
      });
      expect(result.rows[0].request_id).toBe("r1");
    });

    it("returns results ordered by timestamp DESC", () => {
      const result = store.queryAuditLogs({});
      const timestamps = result.rows.map((r) => r.timestamp);
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i] <= timestamps[i - 1]).toBe(true);
      }
    });

    it("paginates with limit and offset", () => {
      const page1 = store.queryAuditLogs({ limit: 2, offset: 0 });
      expect(page1.rows).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page2 = store.queryAuditLogs({ limit: 2, offset: 2 });
      expect(page2.rows).toHaveLength(2);
      expect(page2.total).toBe(5);

      const page3 = store.queryAuditLogs({ limit: 2, offset: 4 });
      expect(page3.rows).toHaveLength(1);
      expect(page3.total).toBe(5);

      const allIds = [...page1.rows, ...page2.rows, ...page3.rows].map((r) => r.request_id);
      expect(new Set(allIds).size).toBe(5);
    });

    it("defaults limit to 50 and offset to 0", () => {
      const result = store.queryAuditLogs({});
      expect(result.rows).toHaveLength(5);
    });

    it("returns empty rows when no matches", () => {
      const result = store.queryAuditLogs({ model: "nonexistent-model" });
      expect(result.rows).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("pagination respects filters", () => {
      const result = store.queryAuditLogs({
        api_key_id: "key-A",
        limit: 1,
        offset: 0,
      });
      expect(result.rows).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.rows[0].api_key_id).toBe("key-A");
    });

    it("offset beyond results returns empty", () => {
      const result = store.queryAuditLogs({ offset: 100 });
      expect(result.rows).toHaveLength(0);
      expect(result.total).toBe(5);
    });
  });

  describe("querySecurityStats", () => {
    beforeEach(() => {
      store.insertAuditLog(makeEntry({
        request_id: "sec-1",
        timestamp: "2026-04-01T10:00:00.000Z",
        status: "success",
        pii_detected: false,
        pii_types_found: null,
        prompt_injection_score: 0,
      }));
      store.insertAuditLog(makeEntry({
        request_id: "sec-2",
        timestamp: "2026-04-02T10:00:00.000Z",
        status: "blocked",
        pii_detected: false,
        pii_types_found: null,
        prompt_injection_score: 0,
      }));
      store.insertAuditLog(makeEntry({
        request_id: "sec-3",
        timestamp: "2026-04-03T10:00:00.000Z",
        status: "success",
        pii_detected: true,
        pii_types_found: JSON.stringify(["EMAIL", "PHONE"]),
        prompt_injection_score: 0,
      }));
      store.insertAuditLog(makeEntry({
        request_id: "sec-4",
        timestamp: "2026-04-04T10:00:00.000Z",
        status: "success",
        pii_detected: true,
        pii_types_found: JSON.stringify(["EMAIL"]),
        prompt_injection_score: 0.1,
      }));
      store.insertAuditLog(makeEntry({
        request_id: "sec-5",
        timestamp: "2026-04-05T10:00:00.000Z",
        status: "success",
        pii_detected: false,
        pii_types_found: null,
        prompt_injection_score: 0.3,
      }));
      store.insertAuditLog(makeEntry({
        request_id: "sec-6",
        timestamp: "2026-04-06T10:00:00.000Z",
        status: "success",
        pii_detected: false,
        pii_types_found: null,
        prompt_injection_score: 0.5,
      }));
      store.insertAuditLog(makeEntry({
        request_id: "sec-7",
        timestamp: "2026-04-07T10:00:00.000Z",
        status: "success",
        pii_detected: false,
        pii_types_found: null,
        prompt_injection_score: 0.7,
      }));
      store.insertAuditLog(makeEntry({
        request_id: "sec-8",
        timestamp: "2026-04-08T10:00:00.000Z",
        status: "success",
        pii_detected: false,
        pii_types_found: null,
        prompt_injection_score: 0.9,
      }));
      store.insertAuditLog(makeEntry({
        request_id: "sec-9",
        timestamp: "2026-04-09T10:00:00.000Z",
        status: "blocked",
        pii_detected: true,
        pii_types_found: JSON.stringify(["SSN"]),
        prompt_injection_score: 0.95,
      }));
    });

    it("returns correct blockedRequests count", () => {
      const result = store.querySecurityStats();
      expect(result.blockedRequests).toBe(2);
    });

    it("returns correct piiDetections total and byType breakdown", () => {
      const result = store.querySecurityStats();
      expect(result.piiDetections.total).toBe(3);
      expect(result.piiDetections.byType).toEqual({
        EMAIL: 2,
        PHONE: 1,
        SSN: 1,
      });
    });

    it("returns correct injectionAttempts total, avgScore, and scoreDistribution", () => {
      const result = store.querySecurityStats();
      expect(result.injectionAttempts.total).toBe(6);
      expect(result.injectionAttempts.avgScore).toBeCloseTo(0.575, 3);
      expect(result.injectionAttempts.scoreDistribution).toEqual({
        "0-0.2": 1,
        "0.2-0.4": 1,
        "0.4-0.6": 1,
        "0.6-0.8": 1,
        "0.8-1.0": 2,
      });
    });

    it("returns correct contentFilter allowed/flagged/blocked counts", () => {
      const result = store.querySecurityStats();
      expect(result.contentFilter.allowed).toBe(1);
      expect(result.contentFilter.flagged).toBe(6);
      expect(result.contentFilter.blocked).toBe(2);
    });

    it("filters by date range", () => {
      const result = store.querySecurityStats({
        startDate: "2026-04-03T00:00:00.000Z",
        endDate: "2026-04-07T23:59:59.000Z",
      });
      expect(result.blockedRequests).toBe(0);
      expect(result.piiDetections.total).toBe(2);
      expect(result.injectionAttempts.total).toBe(4);
    });

    it("returns zeros for empty database", () => {
      const emptyDb = new Database(":memory:");
      emptyDb.exec(SCHEMA);
      const emptyStore = new AuditStore(emptyDb);

      const result = emptyStore.querySecurityStats();
      expect(result.blockedRequests).toBe(0);
      expect(result.piiDetections.total).toBe(0);
      expect(result.piiDetections.byType).toEqual({});
      expect(result.injectionAttempts.total).toBe(0);
      expect(result.injectionAttempts.avgScore).toBe(0);
      expect(result.injectionAttempts.scoreDistribution).toEqual({
        "0-0.2": 0,
        "0.2-0.4": 0,
        "0.4-0.6": 0,
        "0.6-0.8": 0,
        "0.8-1.0": 0,
      });
      expect(result.contentFilter.allowed).toBe(0);
      expect(result.contentFilter.flagged).toBe(0);
      expect(result.contentFilter.blocked).toBe(0);

      emptyDb.close();
    });
  });
});
