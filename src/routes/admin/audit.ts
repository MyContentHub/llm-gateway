import { z } from "zod";
import type { FastifyPluginCallback } from "fastify";
import { AuditStore } from "../../db/audit-store.js";
import { adminTokenSecurity, error400, error401, error404 } from "../../schemas/common.js";
import {
  listAuditLogsQuerySchema,
  auditStatsQuerySchema,
  securityStatsQuerySchema,
} from "../../schemas/admin/audit.js";
import "../../types.js";

const ListAuditLogsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  model: z.string().optional(),
  endpoint: z.string().optional(),
  status: z.string().optional(),
  api_key_id: z.string().optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});

const AuditStatsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const SecurityStatsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const adminAuditPlugin: FastifyPluginCallback = (server, _opts, done) => {
  const auditStore = new AuditStore(server.db);
  const adminToken = server.config.admin_token;

  server.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.code(401).send({
        error: {
          message: "Missing or invalid authorization header",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      });
    }

    const token = authHeader.slice(7);
    if (token !== adminToken) {
      return reply.code(401).send({
        error: {
          message: "Invalid admin token",
          type: "authentication_error",
          code: "invalid_api_key",
        },
      });
    }
  });

  server.get("/admin/audit/logs", {
    validatorCompiler: () => () => true,
    schema: {
      summary: "List audit logs",
      description: "Returns a paginated list of audit logs with optional filtering",
      tags: ["Admin - Audit"],
      security: adminTokenSecurity,
      querystring: listAuditLogsQuerySchema,
      response: {
        200: {},
        ...error400,
        ...error401,
      },
    },
  }, async (request, reply) => {
    const parsed = ListAuditLogsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          message: parsed.error.issues.map((i) => i.message).join(", "),
          type: "invalid_request_error",
          code: "invalid_request",
        },
      });
    }

    const result = auditStore.queryAuditLogs(parsed.data);

    return reply.send({
      logs: result.rows,
      total: result.total,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
  });

  server.get<{ Params: { requestId: string } }>("/admin/audit/logs/:requestId", {
    schema: {
      summary: "Get an audit log",
      description: "Retrieves a single audit log entry by its request ID",
      tags: ["Admin - Audit"],
      security: adminTokenSecurity,
      params: {
        type: "object",
        properties: { requestId: { type: "string" } },
        required: ["requestId"],
      },
      response: {
        200: {},
        ...error401,
        ...error404,
      },
    },
  }, async (request, reply) => {
    const { requestId } = request.params;
    const row = auditStore.getAuditLogById(requestId);
    if (!row) {
      return reply.code(404).send({
        error: {
          message: "Audit log not found",
          type: "invalid_request_error",
          code: "audit_log_not_found",
        },
      });
    }
    return reply.send(row);
  });

  server.get("/admin/audit/stats", {
    validatorCompiler: () => () => true,
    schema: {
      summary: "Get audit statistics",
      description: "Returns aggregated audit statistics including request counts, token usage, costs, and PII detection rates",
      tags: ["Admin - Audit"],
      security: adminTokenSecurity,
      querystring: auditStatsQuerySchema,
      response: {
        200: {},
        ...error400,
        ...error401,
      },
    },
  }, async (request, reply) => {
    const parsed = AuditStatsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          message: parsed.error.issues.map((i) => i.message).join(", "),
          type: "invalid_request_error",
          code: "invalid_request",
        },
      });
    }

    const { startDate, endDate } = parsed.data;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (startDate) {
      conditions.push("timestamp >= ?");
      params.push(startDate);
    }
    if (endDate) {
      conditions.push("timestamp <= ?");
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const overallSql = `SELECT
      COUNT(*) as totalRequests,
      COALESCE(SUM(prompt_tokens + completion_tokens), 0) as totalTokens,
      COALESCE(SUM(cost_usd), 0) as totalCostUsd,
      COALESCE(AVG(latency_ms), 0) as avgLatencyMs,
      COALESCE(SUM(CASE WHEN pii_detected = 1 THEN 1 ELSE 0 END), 0) as piiDetections
    FROM audit_logs ${whereClause}`;

    const overall = server.db.prepare(overallSql).get(...params) as {
      totalRequests: number;
      totalTokens: number;
      totalCostUsd: number;
      avgLatencyMs: number;
      piiDetections: number;
    };

    const byModelSql = `SELECT model, COUNT(*) as count,
      COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens,
      COALESCE(SUM(cost_usd), 0) as costUsd
    FROM audit_logs ${whereClause} GROUP BY model`;

    const byModelRows = server.db.prepare(byModelSql).all(...params) as {
      model: string | null;
      count: number;
      tokens: number;
      costUsd: number;
    }[];

    const byModel: Record<string, { count: number; tokens: number; costUsd: number }> = {};
    for (const row of byModelRows) {
      const key = row.model ?? "unknown";
      byModel[key] = { count: row.count, tokens: row.tokens, costUsd: row.costUsd };
    }

    const byStatusSql = `SELECT status, COUNT(*) as count FROM audit_logs ${whereClause} GROUP BY status`;
    const byStatusRows = server.db.prepare(byStatusSql).all(...params) as {
      status: string;
      count: number;
    }[];

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) {
      byStatus[row.status] = row.count;
    }

    const piiDetectionRate = overall.totalRequests > 0
      ? overall.piiDetections / overall.totalRequests
      : 0;

    return reply.send({
      totalRequests: overall.totalRequests,
      totalTokens: overall.totalTokens,
      totalCostUsd: overall.totalCostUsd,
      avgLatencyMs: Math.round(overall.avgLatencyMs * 100) / 100,
      byModel,
      byStatus,
      piiDetectionRate,
    });
  });

  server.get("/admin/audit/security", {
    validatorCompiler: () => () => true,
    schema: {
      summary: "Get security statistics",
      description: "Returns aggregated security statistics including blocked requests, PII detections, injection attempts, and content filter breakdown",
      tags: ["Admin - Audit"],
      security: adminTokenSecurity,
      querystring: securityStatsQuerySchema,
      response: {
        200: {},
        ...error400,
        ...error401,
      },
    },
  }, async (request, reply) => {
    const parsed = SecurityStatsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          message: parsed.error.issues.map((i) => i.message).join(", "),
          type: "invalid_request_error",
          code: "invalid_request",
        },
      });
    }

    const result = auditStore.querySecurityStats(parsed.data);
    return reply.send(result);
  });

  done();
};
