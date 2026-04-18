import type { FastifyRequest, FastifyReply, preHandlerAsyncHookHandler } from "fastify";
import { createContentFilter } from "../security/content-filter-engine.js";
import { createPiiContext, type PiiContext } from "../security/pii-redact.js";
import type { SecurityConfig } from "../config/index.js";

export interface SecurityScanResult {
  action: "allow" | "block" | "flag";
  piiDetected: boolean;
  piiTypesFound: string[];
  injectionScore: number;
  piiMapping: Map<string, string>;
  redactedMessages: unknown[];
}

function extractMessageContent(messages: unknown[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (msg && typeof msg === "object" && "content" in msg) {
      const content = (msg as Record<string, unknown>).content;
      if (typeof content === "string") {
        parts.push(content);
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part && typeof part === "object" && "text" in part) {
            parts.push(String((part as Record<string, unknown>).text));
          }
        }
      }
    }
  }
  return parts.join("\n");
}

function redactMessages(
  messages: unknown[],
  piiContext: PiiContext,
): { redacted: unknown[]; mapping: Map<string, string> } {
  const mapping = new Map<string, string>();

  const redacted = messages.map((msg) => {
    if (!msg || typeof msg !== "object" || !("content" in msg)) return msg;
    const record = msg as Record<string, unknown>;
    const content = record.content;

    if (typeof content === "string") {
      const result = piiContext.redact(content);
      for (const [k, v] of result.mapping) mapping.set(k, v);
      return { ...record, content: result.text };
    }

    if (Array.isArray(content)) {
      const newParts = content.map((part) => {
        if (part && typeof part === "object" && "text" in part) {
          const partRecord = part as Record<string, unknown>;
          const result = piiContext.redact(String(partRecord.text));
          for (const [k, v] of result.mapping) mapping.set(k, v);
          return { ...partRecord, text: result.text };
        }
        return part;
      });
      return { ...record, content: newParts };
    }

    return msg;
  });

  return { redacted, mapping };
}

export function createSecurityMiddleware(securityConfig: SecurityConfig): preHandlerAsyncHookHandler {
  const contentFilter = createContentFilter(securityConfig);

  return async function securityPreHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const body = request.body as { messages?: unknown[] } | undefined;
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return;
    }

    const allText = extractMessageContent(body.messages);
    if (!allText) return;

    const filterResult = contentFilter(allText);

    if (filterResult.action === "block") {
      reply.code(400).send({
        error: {
          message: filterResult.reason ?? "Request blocked by content filter",
          type: "content_filter_error",
          code: "content_blocked",
        },
      });
      return;
    }

    const piiContext = createPiiContext();
    const { redacted, mapping } = redactMessages(body.messages, piiContext);

    const scanResult: SecurityScanResult = {
      action: filterResult.action,
      piiDetected: mapping.size > 0,
      piiTypesFound: filterResult.piiTypes ?? [],
      injectionScore: filterResult.injectionScore ?? 0,
      piiMapping: mapping,
      redactedMessages: redacted,
    };

    (request as any).securityScan = scanResult;
  };
}
