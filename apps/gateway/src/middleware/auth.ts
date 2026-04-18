import Database from "better-sqlite3";
import { verifyApiKey } from "../utils/crypto.js";
import type { RateLimits, VirtualKeyData } from "../db/keys.js";
import type { FastifyRequest, FastifyReply } from "fastify";

export interface ApiKeyInfo {
  id: string;
  name: string;
  rateLimits: RateLimits;
}

interface AuthCacheEntry {
  keyData: VirtualKeyData;
  expires: number;
}

const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const AUTH_CACHE_MAX_SIZE = 1000;

interface VirtualKeyRow {
  id: string;
  name: string;
  key_hash: string;
  rate_limits: string;
  created_at: string;
  revoked_at: string | null;
}

function createOpenAiError(message: string, code: string) {
  return {
    error: {
      message,
      type: "invalid_request_error",
      code,
    },
  };
}

export function createAuthMiddleware(db: Database.Database) {
  const authCache = new Map<string, AuthCacheEntry>();
  const stmtGetActiveKeys = db.prepare(
    "SELECT id, name, key_hash, rate_limits, created_at, revoked_at FROM virtual_keys WHERE revoked_at IS NULL"
  );

  function pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of authCache) {
      if (entry.expires <= now) {
        authCache.delete(key);
      }
    }
  }

  return async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      reply.code(401).send(createOpenAiError("Missing Authorization header.", "invalid_api_key"));
      return;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      reply.code(401).send(createOpenAiError("Invalid Authorization header format. Expected: Bearer <token>", "invalid_api_key"));
      return;
    }

    const token = parts[1];

    pruneCache();
    const cached = authCache.get(token);
    if (cached && cached.expires > Date.now()) {
      (request as any).apiKey = {
        id: cached.keyData.id,
        name: cached.keyData.name,
        rateLimits: cached.keyData.rateLimits,
      };
      return;
    }
    authCache.delete(token);

    const rows = stmtGetActiveKeys.all() as VirtualKeyRow[];

    let matchedRow: VirtualKeyRow | null = null;
    for (const row of rows) {
      const valid = await verifyApiKey(token, row.key_hash);
      if (valid) {
        matchedRow = row;
        break;
      }
    }

    if (!matchedRow) {
      reply.code(401).send(createOpenAiError("Invalid API key provided.", "invalid_api_key"));
      return;
    }

    const keyData: VirtualKeyData = {
      id: matchedRow.id,
      name: matchedRow.name,
      rateLimits: JSON.parse(matchedRow.rate_limits),
      createdAt: matchedRow.created_at,
      revokedAt: matchedRow.revoked_at,
    };

    if (authCache.size >= AUTH_CACHE_MAX_SIZE) {
      const firstKey = authCache.keys().next().value;
      if (firstKey !== undefined) {
        authCache.delete(firstKey);
      }
    }
    authCache.set(token, { keyData, expires: Date.now() + AUTH_CACHE_TTL_MS });

    (request as any).apiKey = {
      id: keyData.id,
      name: keyData.name,
      rateLimits: keyData.rateLimits,
    };
  };
}

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: ApiKeyInfo;
  }
}
