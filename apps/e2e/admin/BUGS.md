# Admin Dashboard — Bug List

Generated from E2E test execution (45/45 passing) and code analysis.

**Status**: All 22 bugs resolved (4 found & fixed during E2E + 11 functional + 4 accessibility + 3 code quality).

---

## Bugs Found & Fixed During E2E Testing

| # | Severity | Location | Bug | Fix Applied |
|---|----------|----------|-----|-------------|
| F1 | **High** | `src/schemas/admin/config.ts` | Providers API `modelMappings` serialized as `{}` — schema had `{ type: "object" }` without `additionalProperties: true`, causing fast-json-stringify to strip contents | Added `additionalProperties: true` |
| F2 | **High** | `admin/src/hooks/use-keys.ts`, `pages/keys.tsx` | Frontend `VirtualKey` type expected `created_at`/`revoked_at` (snake_case) but API returns `createdAt`/`revokedAt` (camelCase) — Created column empty, Revoked status always "Active" | Updated frontend to use camelCase field names matching API |
| F3 | **High** | `admin/src/pages/keys.tsx` | `revoked_at` accessor on action buttons used wrong field name — revoked keys showed "Active" status and enabled edit button | Changed to `revokedAt` |
| F4 | **Medium** | `admin/src/pages/keys/edit-sheet.tsx` | Edit sheet showed "Prefix: undefined" when `key_prefix` not in API response | Added fallback to "gwk_****" |

---

## Functional Bugs — All Resolved

| # | Severity | Location | Bug | Fix Applied |
|---|----------|----------|-----|-------------|
| 1 | **High** | `admin/src/lib/api-client.ts` | `apiClient` hard-redirected on 401 — `window.location.href` fired before React error handlers | Changed to `throw new Error("Unauthorized")`; `QueryErrorHandler` in App.tsx handles SPA navigation to `/login` |
| 2 | **High** | `admin/src/layout/*` | Fixed header (h-16, z-30) overlapped page content, blocking pointer events | Added `pt-20` (80px) top padding to `<main>` in App.tsx, exceeding header height |
| 3 | **Medium** | `overview.tsx` | Latency delta color direction inverted — higher latency showed green | Added `invertDelta` prop to `KpiCard`; latency card passes `invertDelta` to swap color semantics |
| 4 | **Medium** | `audit.tsx` | CSV export had no error UI — errors swallowed silently | Added `exportError`/`exportWarning` state with red/amber alert banners and try/catch in `handleExport` |
| 5 | **Medium** | `audit/export.ts` | Export accumulated ALL rows in `allRows[]` before generating CSV — potential OOM | Refactored to build CSV incrementally per page using `string[]` parts; old page objects GC'd each iteration |
| 6 | **Low** | `keys.tsx` | `navigator.clipboard.writeText` not wrapped in try/catch | Wrapped in `try { ... } catch { }` block |
| 7 | **Low** | `keys/create-dialog.tsx`, `keys/edit-sheet.tsx` | Empty rate limit fields sent `0` instead of being omitted | Added conditional spread: `rpmNum > 0 ? { rpm: rpmNum } : {}` pattern; entire `rateLimits` set to `undefined` when all empty (create) |
| 8 | **Low** | `components/charts/pie-chart.tsx` | Pie slice and legend colors mismatched for non-standard status names | Both slice `<Cell fill>` and legend `<span style>` now use identical `COLORS[name] ?? DEFAULT_COLORS[index]` expression |
| 9 | **Low** | `components/data-table.tsx` | Hardcoded empty state text "No keys found" in generic component | Added optional `emptyMessage` prop; falls back to `t("dataTable.empty")` i18n key |
| 10 | **Low** | `lib/utils.ts` | `formatUsd()` had dead code — `if (n < 1)` branch identical to final return | Changed to `if (n < 0.01 && n > 0) return toFixed(4)` — distinct behavior for micro-costs |
| 11 | **Low** | `pages/providers.tsx` | Key health bar width proportional to latency — high-latency keys got wider bars | Bar width now derived from health status + consecutive errors; latency displayed as separate text label |

## Accessibility Bugs — All Resolved

| # | Severity | Location | Bug | Fix Applied |
|---|----------|----------|-----|-------------|
| 12 | **Medium** | `login.tsx`, `create-dialog.tsx`, `edit-sheet.tsx`, `audit.tsx` | `<label>` elements not associated with inputs via `htmlFor`/`id` | All `<label>`/`<input>` pairs now have matching `htmlFor`/`id` attributes |
| 13 | **Medium** | All modals/drawers | No focus trap — Tab key navigated to elements behind overlay | Added `useFocusTrap` hook; applied to all modals including `json-modal.tsx` |
| 14 | **Medium** | All modals/drawers | Pressing Escape did not close dialogs | `useFocusTrap` hook handles Escape key; closes all modals including `json-modal.tsx` |
| 15 | **Low** | `login.tsx`, `keys.tsx`, close buttons in 4 modals | Icon-only buttons missing `aria-label` | Added `aria-label` with i18n key `t("common.close")` to all icon-only buttons including close (X) buttons |

## Code Quality Issues — All Resolved

| # | Severity | Location | Issue | Fix Applied |
|---|----------|----------|-------|-------------|
| 16 | **Low** | `admin/package.json` | Unused dependencies: `date-fns`, `class-variance-authority` | Both now actively imported — `date-fns` in `audit.tsx` and `calendar.tsx`; `class-variance-authority` in `button.tsx` |
| 17 | **Low** | `overview.tsx`, `audit.tsx` | `StatusBadge` component duplicated verbatim | Extracted to shared `components/status-badge.tsx`; both files import it |
| 18 | **Low** | `overview.tsx`, `audit.tsx`, `security.tsx`, `detail-drawer.tsx` | `InjectionScoreBar` logic duplicated 4 times | Extracted to shared `components/injection-score-bar.tsx`; all 3 consumers import it |
