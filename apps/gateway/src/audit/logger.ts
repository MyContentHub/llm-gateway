import { createHash, randomUUID } from "node:crypto";
import type { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import type Database from "better-sqlite3";
import { AuditStore, type AuditLogEntry } from "../db/audit-store.js";
import { calculateCost } from "../utils/cost.js";
import { countChatTokens } from "../security/tokenizer.js";
import type { AppConfig } from "../config/index.js";

export function createAuditLogger(db: Database.Database, config: AppConfig): FastifyPluginCallback {
  return fp(function auditLoggerPlugin(server, _opts, done) {
    const auditStore = new AuditStore(db);

    server.addHook("onSend", async (request, _reply, payload) => {
      if (typeof payload === "string") {
        (request as any)._auditResponseBody = payload;
      }
      return payload;
    });

    server.addHook("onResponse", (request, reply, done) => {
      if (!request.url.startsWith("/api/v1/")) {
        done();
        return;
      }

      const body = request.body as Record<string, unknown> | undefined;
      const model = (body?.model as string) ?? "unknown";
      const endpoint = request.url;
      const latency = reply.elapsedTime;
      const statusCode = reply.statusCode;

      let promptTokens = 0;
      let completionTokens = 0;

      const isStreaming = reply.getHeader("content-type") === "text/event-stream";
      const responseBody = (request as any)._auditResponseBody as string | undefined;

      if (!isStreaming && responseBody && typeof responseBody === "string") {
        try {
          const parsed = JSON.parse(responseBody) as { usage?: { prompt_tokens?: number; completion_tokens?: number } };
          if (parsed?.usage) {
            promptTokens = parsed.usage.prompt_tokens ?? 0;
            completionTokens = parsed.usage.completion_tokens ?? 0;
          }
        } catch {}
      }

      if (promptTokens === 0 && completionTokens === 0 && (body?.stream || isStreaming)) {
        if (Array.isArray(body?.messages)) {
          promptTokens = countChatTokens(body.messages as { content: string }[], model);
        }
      }

      const cost = calculateCost(model, promptTokens, completionTokens);

      const securityScan = request.securityScan;

      let status: string;
      if (securityScan?.action === "block") {
        status = "blocked";
      } else if (statusCode >= 400) {
        status = "error";
      } else {
        status = "success";
      }

      const piiDetected = securityScan?.piiDetected ?? false;
      const piiTypesFound = securityScan?.piiTypesFound?.length
        ? JSON.stringify(securityScan.piiTypesFound)
        : null;
      const injectionScore = securityScan?.injectionScore ?? 0;

      let contentHash: string | null = null;
      if (request.body) {
        contentHash = createHash("sha256")
          .update(JSON.stringify(request.body))
          .digest("hex");
      }

      const apiKeyId = (request as any).apiKey?.id ?? null;

      const MAX_BODY_BYTES = 131072;

      let requestBody: string | null = null;
      let requestBodyTruncated = 0;
      if (request.body) {
        const raw = JSON.stringify(request.body);
        const buf = Buffer.from(raw, "utf-8");
        if (buf.length > MAX_BODY_BYTES) {
          requestBody = buf.slice(0, MAX_BODY_BYTES).toString("utf-8");
          requestBodyTruncated = 1;
        } else {
          requestBody = raw;
        }
      }

      let responseBodyField: string | null = null;
      let responseBodyTruncated = 0;
      if (securityScan?.action === "block") {
        responseBodyField = null;
      } else if (responseBody) {
        const buf = Buffer.from(responseBody, "utf-8");
        if (buf.length > MAX_BODY_BYTES) {
          responseBodyField = buf.slice(0, MAX_BODY_BYTES).toString("utf-8");
          responseBodyTruncated = 1;
        } else {
          responseBodyField = responseBody;
        }
      }

      const entry: AuditLogEntry = {
        request_id: randomUUID(),
        timestamp: new Date().toISOString(),
        api_key_id: apiKeyId,
        model,
        endpoint,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        cost_usd: cost,
        latency_ms: latency,
        status,
        pii_detected: piiDetected,
        pii_types_found: piiTypesFound,
        prompt_injection_score: injectionScore,
        content_hash_sha256: contentHash,
        request_body: requestBody,
        response_body: responseBodyField,
        request_body_truncated: requestBodyTruncated,
        response_body_truncated: responseBodyTruncated,
      };

      auditStore.insertAuditLog(entry);
      done();
    });

    done();
  }, { name: "audit-logger" });
}
