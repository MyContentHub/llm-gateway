# AGENTS.md

## Project

LLM API security proxy gateway — intercepts, scans, and audits all OpenAI-compatible API requests.

**Status**: Design phase only. No source code yet. See `docs/DESIGN.md` for the full architecture plan.

## Tech Stack (from design)

- **Runtime**: Node.js 20+ (LTS) — relies on native `fetch` and Web Streams API
- **Framework**: Fastify 5
- **Language**: TypeScript 5 (strict mode)
- **Package manager**: pnpm 10 (`packageManager` field in `package.json`)
- **Database**: better-sqlite3 (single-file, zero-ops)
- **Testing**: vitest
- **Validation**: zod
- **Logging**: pino (structured JSON, Fastify default)
- **Metrics**: prom-client (Prometheus export)
- **PII detection**: compromise (NLP) + custom regex patterns
- **Token counting**: js-tiktoken
- **SSE parsing**: eventsource-parser
- **Encryption**: Node.js built-in `crypto` (AES-256-GCM)

## Architecture Summary

```
Client → [Auth] → [Rate Limit] → [PII Redact] → [Content Filter] → [Route] → [Upstream Proxy]
       ← [PII Restore] ← [Audit Log] ←
```

- Providers are config-driven — any `baseUrl` works, no per-provider adapters
- PII mapping lives in request scope only, never persisted
- Audit logs store metadata only (no raw prompt/response content)

## Planned Directory Layout

```
src/
  index.ts              # Fastify entrypoint
  config/               # zod env + config parsing, provider registration
  routes/v1/            # chat-completions, completions, embeddings, models
  routes/admin/         # virtual Key CRUD, audit log queries
  middleware/            # auth, rate-limit, request-context
  proxy/                # forwarder, sse-parser, router
  security/             # pii-scanner, pii-patterns, content-filter, tokenizer
  audit/                # logger, schema
  db/                   # SQLite init + migration, key storage, audit store
  utils/                # crypto (AES-256-GCM), cost calculation
migrations/
  001-init.sql          # keys, audit_logs, providers tables
```

## Key Implementation Notes

- **Streaming SSE is the core challenge** — use Web Streams `TransformStream` to process chunks in-flight; buffer partial lines across TCP packets; handle `data: [DONE]` as a special case (not JSON)
- **Virtual API Keys**: client keys are hashed with argon2; upstream provider keys are encrypted with AES-256-GCM and stored in SQLite
- **Rate limiting**: in-memory sliding window (RPM/TPM/RPD) — no Redis dependency for single-node
- `docs/OPENAI_API_REFERENCE.md` contains the full OpenAI API wire format, SSE lifecycle, error codes, and provider compatibility matrix — consult it when implementing proxy routes

## Commands

No commands exist yet. Once source code is added, expected commands:

```bash
pnpm install          # install dependencies
pnpm dev              # dev server (to be created)
pnpm test             # run tests with vitest (to be configured)
pnpm build            # TypeScript compile (to be configured)
```

## Conventions

- Design docs are in Chinese — agent should be aware when reading `docs/DESIGN.md`
- Phased implementation plan in DESIGN.md: Phase 1 (core proxy) → Phase 2 (auth & rate limit) → Phase 3 (security scanning) → Phase 4 (audit & monitoring) → Phase 5 (enhancements)
