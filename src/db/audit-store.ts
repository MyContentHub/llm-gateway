import type Database from "better-sqlite3";

export interface AuditLogEntry {
  request_id: string;
  timestamp: string;
  api_key_id?: string | null;
  model?: string | null;
  endpoint?: string | null;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost_usd?: number;
  latency_ms?: number;
  status?: string;
  pii_detected?: boolean;
  pii_types_found?: string | null;
  prompt_injection_score?: number;
  content_hash_sha256?: string | null;
}

export interface AuditLogRow {
  id: number;
  request_id: string;
  timestamp: string;
  api_key_id: string | null;
  model: string | null;
  endpoint: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status: string;
  pii_detected: number;
  pii_types_found: string | null;
  prompt_injection_score: number;
  content_hash_sha256: string | null;
}

export interface AuditLogFilters {
  startDate?: string;
  endDate?: string;
  model?: string;
  api_key_id?: string;
  endpoint?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogQueryResult {
  rows: AuditLogRow[];
  total: number;
}

export class AuditStore {
  private db: Database.Database;
  private stmtInsert: Database.Statement;
  private stmtGetByRequestId: Database.Statement;

  constructor(db: Database.Database) {
    this.db = db;

    this.stmtInsert = db.prepare(
      `INSERT INTO audit_logs (
        request_id, timestamp, api_key_id, model, endpoint,
        prompt_tokens, completion_tokens, cost_usd, latency_ms,
        status, pii_detected, pii_types_found, prompt_injection_score,
        content_hash_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    this.stmtGetByRequestId = db.prepare(
      `SELECT id, request_id, timestamp, api_key_id, model, endpoint,
        prompt_tokens, completion_tokens, cost_usd, latency_ms,
        status, pii_detected, pii_types_found, prompt_injection_score,
        content_hash_sha256
      FROM audit_logs WHERE request_id = ?`
    );
  }

  insertAuditLog(entry: AuditLogEntry): void {
    this.stmtInsert.run(
      entry.request_id,
      entry.timestamp,
      entry.api_key_id ?? null,
      entry.model ?? null,
      entry.endpoint ?? null,
      entry.prompt_tokens ?? 0,
      entry.completion_tokens ?? 0,
      entry.cost_usd ?? 0,
      entry.latency_ms ?? 0,
      entry.status ?? "success",
      entry.pii_detected ? 1 : 0,
      entry.pii_types_found ?? null,
      entry.prompt_injection_score ?? 0,
      entry.content_hash_sha256 ?? null
    );
  }

  getAuditLogById(requestId: string): AuditLogRow | null {
    const row = this.stmtGetByRequestId.get(requestId) as AuditLogRow | undefined;
    return row ?? null;
  }

  queryAuditLogs(filters: AuditLogFilters): AuditLogQueryResult {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.startDate) {
      conditions.push("timestamp >= ?");
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push("timestamp <= ?");
      params.push(filters.endDate);
    }
    if (filters.model) {
      conditions.push("model = ?");
      params.push(filters.model);
    }
    if (filters.api_key_id) {
      conditions.push("api_key_id = ?");
      params.push(filters.api_key_id);
    }
    if (filters.endpoint) {
      conditions.push("endpoint = ?");
      params.push(filters.endpoint);
    }
    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countSql = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
    const countRow = this.db.prepare(countSql).get(...params) as { total: number };

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const dataSql = `SELECT id, request_id, timestamp, api_key_id, model, endpoint,
      prompt_tokens, completion_tokens, cost_usd, latency_ms,
      status, pii_detected, pii_types_found, prompt_injection_score,
      content_hash_sha256
    FROM audit_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;

    const rows = this.db.prepare(dataSql).all(...params, limit, offset) as AuditLogRow[];

    return {
      rows,
      total: countRow.total,
    };
  }
}
