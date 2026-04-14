# Admin Dashboard — Bug List

Generated from E2E test execution (45/45 passing) and code analysis.

---

## Bugs Found & Fixed During E2E Testing

| # | Severity | Location | Bug | Fix Applied |
|---|----------|----------|-----|-------------|
| F1 | **High** | `src/schemas/admin/config.ts` | Providers API `modelMappings` serialized as `{}` — schema had `{ type: "object" }` without `additionalProperties: true`, causing fast-json-stringify to strip contents | Added `additionalProperties: true` |
| F2 | **High** | `admin/src/hooks/use-keys.ts`, `pages/keys.tsx` | Frontend `VirtualKey` type expected `created_at`/`revoked_at` (snake_case) but API returns `createdAt`/`revokedAt` (camelCase) — Created column empty, Revoked status always "Active" | Updated frontend to use camelCase field names matching API |
| F3 | **High** | `admin/src/pages/keys.tsx` | `revoked_at` accessor on action buttons used wrong field name — revoked keys showed "Active" status and enabled edit button | Changed to `revokedAt` |
| F4 | **Medium** | `admin/src/pages/keys/edit-sheet.tsx` | Edit sheet showed "Prefix: undefined" when `key_prefix` not in API response | Added fallback to "gwk_****" |

---

## Remaining Functional Bugs

| # | Severity | Location | Bug | Steps to Reproduce | Expected | Actual |
|---|----------|----------|-----|---------------------|----------|--------|
| 1 | **High** | `admin/src/lib/api-client.ts:22-25` | `apiClient` hard-redirects on 401 — `window.location.href = "/admin/login"` fires before React error handlers, making login error messages impossible to display | Submit invalid token on login page | "Token invalid" error message shown | Hard redirect to /admin/login, error message never displayed |
| 2 | **High** | `admin/src/layout/*` (layout components) | Fixed header (h-16, z-30) overlaps page content — "Create Key" button on keys page is partially behind the header, blocking pointer events | Navigate to /admin/keys, try clicking "Create Key" button | Button clickable | Header div intercepts pointer events; must use dispatchEvent workaround |
| 3 | **Medium** | `overview.tsx:60-63` | Latency delta color direction is inverted | View overview when avg latency increased vs previous period | Higher latency should show red (worse) | Shows green with ↑ arrow (implies improvement) |
| 4 | **Medium** | `audit.tsx` (handleExport) | CSV export has no error UI — errors are swallowed silently | Trigger export when backend returns error | User sees error toast/message | Spinner disappears, no feedback |
| 5 | **Medium** | `audit/export.ts:14-30` | Export accumulates ALL rows in memory before generating CSV | Export with thousands of audit logs | Streaming or chunked export | `allRows[]` grows unbounded, may OOM |
| 6 | **Low** | `keys.tsx:25` | `navigator.clipboard.writeText` not wrapped in try/catch | Use admin on non-HTTPS, non-localhost origin | Graceful error or fallback | Throws `DOMException`, breaks copy flow |
| 7 | **Low** | `keys/create-dialog.tsx:30-36`, `keys/edit-sheet.tsx:33-37` | Empty rate limit fields send `0` instead of being omitted | Create key, leave RPM/TPM/RPD empty, submit | Rate limits use server defaults | Sends `{rpm:0, tpm:0, rpd:0}`, effectively disabling limits |
| 8 | **Low** | `components/charts/pie-chart.tsx` | Pie slice and legend colors can mismatch for non-standard status names | View overview with non-standard audit status | Legend dot and pie slice same color | Different colors for unknown statuses |
| 9 | **Low** | `components/data-table.tsx:87` | Hardcoded empty state text "No keys found" in generic component | Use DataTable for non-key data with no results | Configurable empty message | Always shows "No keys found" |
| 10 | **Low** | `lib/utils.ts:15-17` | `formatUsd()` has dead code — `if (n < 1)` branch identical to final return | Call `formatUsd(0.5)` | No redundant branches | `if (n < 1)` is dead code |
| 11 | **Low** | `pages/providers.tsx` | Key health bar width proportional to latency — high-latency keys get wider bars | View providers with varying key latency | Intuitive visualization | Unhealthy high-latency keys get wider bars |

## Accessibility Bugs

| # | Severity | Location | Bug | Steps to Reproduce | Expected | Actual |
|---|----------|----------|-----|---------------------|----------|--------|
| 12 | **Medium** | `login.tsx`, `create-dialog.tsx`, `edit-sheet.tsx`, `audit.tsx` | `<label>` elements not associated with inputs via `htmlFor`/`id` | Use screen reader on login form | Input announced with label | Input announced without label association |
| 13 | **Medium** | All modals/drawers | No focus trap — Tab key navigates to elements behind overlay | Open any dialog, press Tab repeatedly | Focus cycles within dialog | Focus escapes to background elements |
| 14 | **Medium** | All modals/drawers | Pressing Escape does not close any dialog or drawer | Open any modal, press Escape | Modal/drawer closes | Nothing happens |
| 15 | **Low** | `login.tsx`, `keys.tsx` | Icon-only buttons missing `aria-label` | Navigate with screen reader | Buttons have accessible names | Buttons announced as unlabeled |

## Code Quality Issues

| # | Severity | Location | Issue | Expected | Actual |
|---|----------|----------|-------|----------|--------|
| 16 | **Low** | `admin/package.json` | Unused dependencies: `date-fns`, `class-variance-authority` | Only import deps that are used | Listed but never imported |
| 17 | **Low** | `overview.tsx`, `audit.tsx` | `StatusBadge` component duplicated verbatim | Single shared component | Identical component in two files |
| 18 | **Low** | `overview.tsx`, `audit.tsx`, `security.tsx`, `detail-drawer.tsx` | `InjectionScoreBar` logic duplicated 4 times | Single shared component | 4 independent implementations |
