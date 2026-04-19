# Audit Log Body Storage — Design Spec

**Date:** 2026-04-20
**Status:** Approved

## Problem

The Audit Detail Drawer only shows metadata (PII detection types, injection score, token counts, etc.) but not the actual request/response content. When PII is detected or a request is blocked, operators cannot review the original prompt to assess the situation.

## Solution

Store full request body and response body in `audit_logs`, display them in the Detail Drawer with collapsible sections and a full-screen JSON preview Modal. Body fields are cleared after 7 days; metadata rows are deleted after 30 days.

## Data Model

### Migration: `002-add-audit-body.sql`

```sql
ALTER TABLE audit_logs ADD COLUMN request_body TEXT;
ALTER TABLE audit_logs ADD COLUMN response_body TEXT;
ALTER TABLE audit_logs ADD COLUMN request_body_truncated INTEGER DEFAULT 0;
ALTER TABLE audit_logs ADD COLUMN response_body_truncated INTEGER DEFAULT 0;
```

- `request_body` / `response_body`: raw JSON string, max 128KB each
- `*_truncated`: boolean flag (0/1), set to 1 when content exceeds 128KB and is cut

### TypeScript Types

`AuditLogEntry` and `AuditLogRow` in `src/db/audit-store.ts` gain 4 fields:

```typescript
request_body?: string | null;
response_body?: string | null;
request_body_truncated?: number;
response_body_truncated?: number;
```

## Write Logic

In `src/audit/logger.ts`, after collecting the response body:

1. `request_body` = `JSON.stringify(request.body)` sliced to 128KB (131072 bytes)
2. `response_body` = collected response payload sliced to 128KB
3. If either exceeds 128KB, set corresponding `*_truncated = 1`
4. Blocked requests: `response_body = null` (no upstream call was made)

## Query Logic

- **List** (`GET /admin/audit/logs`): no change — existing SELECT does not include body columns
- **Detail** (`GET /admin/audit/logs/:requestId`): SELECT adds the 4 new columns

## Retention & Cleanup

### Two-layer TTL

| Data | Retention | Action |
|---|---|---|
| `request_body`, `response_body` | 7 days | SET to NULL |
| Full row (metadata) | 30 days | DELETE |

### Implementation: `src/audit/cleanup.ts`

New Fastify plugin using `fastify-cron` (which wraps `cron@^2.0.0`):

- Cron expression: `0 * * * *` (every hour, configurable)
- Server `ready` → auto-start; `close` → auto-stop
- Startup: runs cleanup once immediately, then on schedule

Cleanup SQL:

```sql
-- Step 1: clear body fields older than body_retention_days
UPDATE audit_logs
SET request_body = NULL, response_body = NULL,
    request_body_truncated = 0, response_body_truncated = 0
WHERE timestamp < datetime('now', '-7 days')
  AND (request_body IS NOT NULL OR response_body IS NOT NULL);

-- Step 2: delete rows older than retention_days
DELETE FROM audit_logs WHERE timestamp < datetime('now', '-30 days');
```

### Configuration

New `[audit]` section in `config.toml`:

```toml
[audit]
retention_days = 30
body_retention_days = 7
cleanup_cron = "0 * * * *"
```

Zod schema in `src/config/index.ts` — all fields optional with the above defaults.

## Frontend

### Hook: `use-audit-logs.ts`

`AuditLogRow` interface adds optional fields (populated only on detail query):

```typescript
request_body?: string | null;
response_body?: string | null;
request_body_truncated?: number;
response_body_truncated?: number;
```

### Detail Drawer: `detail-drawer.tsx`

Two new collapsible sections inserted after Injection Score, before Content Hash:

**Request Body section:**
- Collapsed: shows endpoint label (e.g. `POST /api/v1/chat/completions`) + "查看完整内容" button
- Expanded: JSON syntax-highlighted, capped at 2000 chars preview. If `request_body_truncated === 1`, show "内容已被截断（超过 128KB）" warning
- "查看完整内容" button opens JSON Modal
- If `request_body` is null → "内容已过期清理（超过 7 天保留期）"

**Response Body section:** same structure, with:
- If null + status is `blocked` → "请求被拦截，无响应内容"
- If null + status is not blocked → "内容已过期清理（超过 7 天保留期）"

### JSON Preview Modal: `json-modal.tsx` (new file)

Full-screen centered Modal:
- Title: "Request Body" / "Response Body"
- Content: monospace font, JSON syntax highlighting, horizontal/vertical scroll
- Footer: copy-to-clipboard button + close button
- Only opens when body is non-null

## File Change Summary

| File | Change |
|---|---|
| `migrations/002-add-audit-body.sql` | New — add 4 columns |
| `src/config/index.ts` | Add `[audit]` zod schema |
| `src/audit/logger.ts` | Write body + truncation logic |
| `src/audit/cleanup.ts` | New — fastify-cron cleanup plugin |
| `src/db/audit-store.ts` | Update types + detail query columns |
| `src/routes/admin/audit.ts` | Detail endpoint returns new fields |
| `src/index.ts` | Register cleanup plugin |
| `admin/src/hooks/use-audit-logs.ts` | Add 4 optional fields to AuditLogRow |
| `admin/src/pages/audit/detail-drawer.tsx` | Collapsible body sections + Modal trigger |
| `admin/src/pages/audit/json-modal.tsx` | New — JSON preview Modal component |
