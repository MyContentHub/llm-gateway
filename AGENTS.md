# AGENTS.md

## Project

LLM API security proxy gateway — intercepts, scans, and audits all OpenAI-compatible API requests. Organized as a **Turborepo monorepo** with pnpm workspaces.

**Status**: All 5 phases complete. 646 tests, production-ready.

## Commands

All commands run from the monorepo root:

```bash
pnpm install          # install all workspace dependencies
pnpm build            # turbo run build (all packages)
pnpm dev              # turbo run dev (all packages)
pnpm test             # turbo run test (all packages)
pnpm typecheck        # turbo run typecheck (all packages)
pnpm lint             # turbo run lint (all packages)
```

Run in a single package:

```bash
pnpm --filter @llm-gateway/gateway dev
pnpm --filter @llm-gateway/gateway test
pnpm --filter @llm-gateway/gateway typecheck
pnpm --filter @llm-gateway/gateway lint
pnpm --filter @llm-gateway/admin dev
pnpm --filter @llm-gateway/admin build
```

**Required verification order**: `pnpm typecheck && pnpm test` (or use `--filter` for gateway specifically)

**Run a single test file**: `pnpm --filter @llm-gateway/gateway vitest run src/proxy/router.test.ts`
**Run tests matching a pattern**: `pnpm --filter @llm-gateway/gateway vitest run -t "round-robin"`

## Tech Stack

- **Monorepo**: Turborepo + pnpm workspaces
- **Runtime**: Node.js 22+ (native `fetch`, Web Streams API)
- **Framework**: Fastify 5
- **Language**: TypeScript 5 strict, ESM (`"type": "module"`), `module: "Node16"`, `moduleResolution: "Node16"`
- **Package manager**: pnpm 10 (via `packageManager` field)
- **Database**: better-sqlite3 (single-file, WAL mode, in-memory for tests)
- **Testing**: vitest (gateway), Playwright (e2e), vitest globals enabled (no imports needed for `describe`/`it`/`expect`)
- **Config**: TOML via `smol-toml` + zod validation — single `config.toml`, no `.env`
- **Other**: prom-client, compromise (NLP PII), js-tiktoken, eventsource-parser, pino

## Module System Quirks

Paths below are relative to `apps/gateway/`:

- **All import paths must end in `.js`** — TypeScript `Node16` moduleResolution requires `.js` extensions for relative imports (e.g., `import { foo } from "./bar.js"` for `bar.ts`)
- tsconfig `rootDir: "src"`, `include: ["src/**/*.ts"]` — test files in `tests/` are not compiled by `tsc` but vitest runs them directly via `tsx`
- `tsconfig.json` does not include `tests/` — only `src/`. Tests import from `../../src/...js` paths and vitest handles transpilation

## Architecture

```
Client → [Auth] → [Rate Limit] → [PII Redact] → [Content Filter] → [Route] → [Upstream Proxy]
       ← [PII Restore] ← [Audit Log + Metrics] ←
```

Request lifecycle in `apps/gateway/src/index.ts`:
1. CORS → Health endpoint → DB plugin → Rate limiter → Metrics → Hook manager
2. `/v1` scope: Auth → Rate limit → Security scan → Rate limit response hook → Hook lifecycle → Audit logger → Route plugins
3. Admin routes (`/admin/*`): Keys CRUD, Audit queries
4. Graceful shutdown via signal handlers

### Key Directories

```
apps/
  gateway/                    # Fastify server (Node.js backend)
    src/
      index.ts                # Fastify entrypoint, wires all middleware/plugins
      types.ts                # Fastify module augmentation (config, db, rateLimiter, hooks)
      config/                 # TOML parsing, zod schemas (AppConfig, Provider, Retry, Security)
      routes/v1/              # chat-completions, embeddings, models (OpenAI-compatible)
      routes/admin/           # virtual key CRUD, audit log queries
      middleware/              # auth, rate-limit, security (PII + injection + content filter)
      proxy/                  # router (model→provider), forwarder (with retry), sse-parser, key-selector, health-tracker, retry
      security/               # pii-scanner, pii-patterns, pii-redact, content-filter, content-filter-engine, tokenizer
      audit/                  # logger (onResponse audit), metrics (prom-client)
      hooks/                  # HookManager — onRequest, preProxy, onResponse, onError
      db/                     # SQLite init + migrations, key store, audit store
      utils/                  # crypto (AES-256-GCM + argon2), cost calculation
      graceful-shutdown.ts    # SIGTERM/SIGINT/uncaughtException handlers
    tests/
      helpers/                # createTestServer (in-memory DB + mock upstream), mock-upstream (canned responses)
      integration/            # 13 E2E test files covering full pipeline
    migrations/
      001-init.sql            # keys, audit_logs, providers tables
  admin/                      # Vite/React SPA (admin dashboard)
    src/
    index.html
    vite.config.ts
  e2e/                        # Playwright E2E tests
    admin/*.spec.ts
    admin/fixtures/
    playwright.config.ts
docs/                         # Design docs, API reference
```

### Fastify Decorations (declared in `apps/gateway/src/types.ts`)

`server.config`, `server.db`, `server.rateLimiter`, `server.hooks` — all typed via module augmentation in `types.ts`. Any new server decorations must be added there.

## Config

All settings in `config.toml` (parsed by `smol-toml`, validated by zod). Schema defaults in `apps/gateway/src/config/index.ts`.

Provider config supports:
- Single `apiKey` (string) or multiple `apiKeys` (array) with `keyStrategy` (`round-robin` | `random` | `least-latency`)
- `modelMappings` for aliasing model names across providers
- `isDefault` flag for fallback routing

Retry config (top-level `[retry]` section): `max_retries`, `initial_delay_ms`, `max_delay_ms`, `backoff_multiplier`

## Testing Conventions

- **Unit tests** live next to source: `apps/gateway/src/**/*.test.ts` (31 files)
- **Integration tests**: `apps/gateway/tests/integration/*.test.ts` (13 files)
- **E2E tests**: `apps/e2e/admin/*.spec.ts`
- **Test helpers**: `apps/gateway/tests/helpers/setup.ts` provides `createTestServer()` which builds a full Fastify instance with in-memory SQLite, mock upstream, and a `createKey()` helper
- **E2E fixtures**: `apps/e2e/admin/fixtures/admin-server.ts`
- **Mock upstream** (`apps/gateway/tests/helpers/mock-upstream.ts`): canned responses for chat completions, embeddings, models; special models `error-429` and `error-500` trigger error responses
- Integration tests use `createTestServer()` → `createKey()` → inject requests with `Authorization: Bearer <key>`
- When adding new provider config in tests, include `keyStrategy: "round-robin"` (zod default, but required for type completeness)

## Conventions

- **No code comments** — the project avoids inline comments
- Design docs in `docs/` are in Chinese — be aware when reading `docs/DESIGN.md`
- `docs/OPENAI_API_REFERENCE.md` has the full OpenAI wire format — consult when modifying proxy routes
- Streaming SSE is the core challenge — uses Web Streams `TransformStream`; `data: [DONE]` is a special non-JSON case
- Virtual API keys: client keys hashed with argon2, upstream keys encrypted AES-256-GCM in SQLite
- PII mapping lives in request scope only, never persisted to disk
- Audit logs store metadata only (no raw prompt/response content)
