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
  request_body?: string | null;
  response_body?: string | null;
  request_body_truncated?: number;
  response_body_truncated?: number;
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
  request_body: string | null;
  response_body: string | null;
  request_body_truncated: number;
  response_body_truncated: number;
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

export interface SecurityStatsFilters {
  startDate?: string;
  endDate?: string;
}

export interface SecurityStatsResult {
  blockedRequests: number;
  piiDetections: {
    total: number;
    byType: Record<string, number>;
  };
  injectionAttempts: {
    total: number;
    avgScore: number;
    scoreDistribution: Record<string, number>;
  };
  contentFilter: {
    allowed: number;
    flagged: number;
    blocked: number;
  };
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
      const sd = filters.startDate;
      params.push(sd.includes("T") ? sd : `${sd}T00:00:00.000Z`);
    }
    if (filters.endDate) {
      const ed = filters.endDate;
      if (ed.includes("T")) {
        conditions.push("timestamp <= ?");
        params.push(ed);
      } else {
        conditions.push("timestamp < ?");
        const d = new Date(`${ed}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        params.push(d.toISOString());
      }
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

  querySecurityStats(filters: SecurityStatsFilters = {}): SecurityStatsResult {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.startDate) {
      conditions.push("timestamp >= ?");
      const sd = filters.startDate;
      params.push(sd.includes("T") ? sd : `${sd}T00:00:00.000Z`);
    }
    if (filters.endDate) {
      const ed = filters.endDate;
      if (ed.includes("T")) {
        conditions.push("timestamp <= ?");
        params.push(ed);
      } else {
        conditions.push("timestamp < ?");
        const d = new Date(`${ed}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        params.push(d.toISOString());
      }
    }

    const hasConditions = conditions.length > 0;
    const where = hasConditions ? `WHERE ${conditions.join(" AND ")}` : "";
    const and = hasConditions ? "AND" : "WHERE";

    const blockedRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM audit_logs ${where} ${and} status = 'blocked'`
    ).get(...params) as { count: number };

    const piiRow = this.db.prepare(
      `SELECT COUNT(*) as count FROM audit_logs ${where} ${and} pii_detected = 1`
    ).get(...params) as { count: number };

    const piiTypeRows = this.db.prepare(
      `SELECT pii_types_found FROM audit_logs ${where} ${and} pii_detected = 1 AND pii_types_found IS NOT NULL`
    ).all(...params) as { pii_types_found: string }[];

    const byType: Record<string, number> = {};
    for (const row of piiTypeRows) {
      try {
        const types: string[] = JSON.parse(row.pii_types_found);
        for (const t of types) {
          byType[t] = (byType[t] ?? 0) + 1;
        }
      } catch {
        // skip unparseable entries
      }
    }

    const injectionRow = this.db.prepare(
      `SELECT
        COUNT(*) as total,
        COALESCE(AVG(prompt_injection_score), 0) as avgScore,
        COALESCE(SUM(CASE WHEN prompt_injection_score > 0 AND prompt_injection_score <= 0.2 THEN 1 ELSE 0 END), 0) as score_0_02,
        COALESCE(SUM(CASE WHEN prompt_injection_score > 0.2 AND prompt_injection_score <= 0.4 THEN 1 ELSE 0 END), 0) as score_02_04,
        COALESCE(SUM(CASE WHEN prompt_injection_score > 0.4 AND prompt_injection_score <= 0.6 THEN 1 ELSE 0 END), 0) as score_04_06,
        COALESCE(SUM(CASE WHEN prompt_injection_score > 0.6 AND prompt_injection_score <= 0.8 THEN 1 ELSE 0 END), 0) as score_06_08,
        COALESCE(SUM(CASE WHEN prompt_injection_score > 0.8 AND prompt_injection_score <= 1.0 THEN 1 ELSE 0 END), 0) as score_08_10
      FROM audit_logs ${where} ${and} prompt_injection_score > 0`
    ).get(...params) as {
      total: number;
      avgScore: number;
      score_0_02: number;
      score_02_04: number;
      score_04_06: number;
      score_06_08: number;
      score_08_10: number;
    };

    const contentFilterRow = this.db.prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'success' AND pii_detected = 0 AND prompt_injection_score = 0 THEN 1 ELSE 0 END), 0) as allowed,
        COALESCE(SUM(CASE WHEN status = 'success' AND (pii_detected = 1 OR prompt_injection_score > 0) THEN 1 ELSE 0 END), 0) as flagged,
        COALESCE(SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END), 0) as blocked
      FROM audit_logs ${where}`
    ).get(...params) as { allowed: number; flagged: number; blocked: number };

    return {
      blockedRequests: blockedRow.count,
      piiDetections: {
        total: piiRow.count,
        byType,
      },
      injectionAttempts: {
        total: injectionRow.total,
        avgScore: Math.round(injectionRow.avgScore * 10000) / 10000,
        scoreDistribution: {
          "0-0.2": injectionRow.score_0_02,
          "0.2-0.4": injectionRow.score_02_04,
          "0.4-0.6": injectionRow.score_04_06,
          "0.6-0.8": injectionRow.score_06_08,
          "0.8-1.0": injectionRow.score_08_10,
        },
      },
      contentFilter: {
        allowed: contentFilterRow.allowed,
        flagged: contentFilterRow.flagged,
        blocked: contentFilterRow.blocked,
      },
    };
  }
}
