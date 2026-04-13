# LLM Gateway Admin Dashboard - Design Plan

## 1. Architecture

```
llm-gateway/
  admin/                    # React + shadcn/ui frontend (Vite)
    src/
      components/           # Shared UI components
      pages/                # 6 page modules
      hooks/                # Data fetching, auth
      lib/                  # API client, utils
    package.json
  src/
    routes/admin/           # Existing admin API (no changes needed)
```

- **Frontend**: Standalone Vite + React + TypeScript app in `admin/`
- **Backend**: Existing Fastify admin API (`/admin/*` endpoints) — no changes needed
- **Dev**: Vite dev server proxies `/admin/*` calls to Fastify backend with `admin_token`
- **Prod**: Build to static files, serve via `@fastify/static` or deploy separately

## 2. Design System

| Token | Value |
|-------|-------|
| **Background** | `#09090b` (zinc-950) |
| **Card BG** | `#18181b` (zinc-900) / `#27272a` (zinc-800) |
| **Border** | `#27272a` (zinc-800) |
| **Text Primary** | `#fafafa` (zinc-50) |
| **Text Secondary** | `#a1a1aa` (zinc-400) |
| **Accent** | `#6366f1` (indigo-500) |
| **Success** | `#22c55e` (green-500) |
| **Warning** | `#f59e0b` (amber-500) |
| **Danger** | `#ef4444` (red-500) |
| **Blocked/Security** | `#f97316` (orange-500) |
| **Font** | Inter (body) + JetBrains Mono (code/data) |
| **Border Radius** | `rounded-lg` (8px) |
| **Spacing** | shadcn/ui default Tailwind scale |

## 3. Layout

```
┌──────────────────────────────────────────────────┐
│ ■ LLM Gateway          [Health ●] [Token] [Auth] │  ← Floating navbar (z-50)
├────────┬─────────────────────────────────────────┤
│        │  Overview / Keys / Audit / ...          │  ← Page title + breadcrumb
│  Side  │                                         │
│  bar   │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│        │  │ KPI Card │ │ KPI Card │ │ KPI Card │   │
│ ○ Home │  └─────────┘ └─────────┘ └─────────┘   │
│ ○ Keys │                                         │
│ ○ Audit│  ┌───────────────────────────────────┐   │
│ ○ Sec  │  │     Main Content Area (table/chart)│   │
│ ○ Prov │  │                                   │   │
│ ○ Set  │  └───────────────────────────────────┘   │
└────────┴─────────────────────────────────────────┘
```

- **Sidebar**: Collapsible, 240px / 64px (icon-only), fixed position
- **Navbar**: Floating, shows provider health indicator + auth token input
- **Content**: `max-w-7xl mx-auto` with responsive grid
- **Mobile**: Sidebar becomes hamburger menu overlay

## 4. Pages

### 4.1 Overview Dashboard

| Section | Component | Data Source |
|---------|-----------|-------------|
| KPI Cards (4) | `Card` + `Lucide` icon | `GET /admin/audit/stats` |
| - Total Requests | Number with delta change | `totalRequests` |
| - Token Usage | Formatted number (K/M) | `totalTokens` |
| - Total Cost | USD amount | `totalCostUsd` |
| - Avg Latency | ms with trend | `avgLatencyMs` |
| By Model Chart | `<BarChart/>` (recharts) | `byModel` breakdown |
| By Status Pie | `<PieChart/>` | `byStatus` (success/error/blocked) |
| Recent Activity | Table, 5 rows | `GET /admin/audit/logs?limit=5` |
| PII Detection Rate | Donut progress | `piiDetectionRate` |

### 4.2 API Key Management

| Section | Component | Action |
|---------|-----------|--------|
| Keys Table | `DataTable` (sortable, paginated) | GET /admin/keys |
| Columns | Name, ID, Rate Limits, Created, Status | |
| Create Key | `Dialog` + `Form` | POST /admin/keys |
| Edit Key | `Sheet` (side panel) | PATCH /admin/keys/:id |
| Revoke Key | `AlertDialog` confirmation | DELETE /admin/keys/:id |
| Post-Creation | `Dialog` showing key **once** + copy button | |
| Status Badge | `Badge` variant=success/danger | Active / Revoked |

### 4.3 Audit Log Browser

| Section | Component | Detail |
|---------|-----------|--------|
| Filter Bar | `Select` + `DatePicker` + `Input` | Date range, model, endpoint, status, API key |
| Log Table | `DataTable` + virtual scroll | GET /admin/audit/logs |
| Columns | Time, Request ID, Key, Model, Tokens, Cost, Latency, Status, PII | |
| Status Badge | Success=green, Error=red, Blocked=orange | |
| PII Indicator | `Badge` + tooltip with type list | `pii_types_found` |
| Injection Score | Progress bar with color gradient (green→orange→red) | `prompt_injection_score` |
| Detail Drawer | `Sheet` right panel | GET /admin/audit/logs/:requestId |
| Export | `Button` → CSV download | Client-side CSV generation |

### 4.4 Security Monitor

| Section | Component | Data Source |
|---------|-----------|-------------|
| Security KPIs | 4 cards | Derived from audit logs |
| - Blocked Requests | Count + trend | `status=blocked` |
| - PII Detections | Count + type breakdown | `pii_detected=true` |
| - Injection Attempts | Count + avg score | `prompt_injection_score > 0` |
| - Content Filter | Allow/flag/block breakdown | Status breakdown |
| Threat Feed | Real-time style table | Filtered to security events |
| PII Type Breakdown | `<BarChart/>` horizontal | `pii_types_found` aggregated |
| Injection Score Distribution | `<Histogram/>` | Score buckets |

### 4.5 Provider/Model Status

| Section | Component | Data Source |
|---------|-----------|-------------|
| Provider Cards | `Card` grid (one per provider) | config + health tracker |
| - Health Status | Green/yellow/red indicator | Health tracker |
| - Key Strategy | Badge (round-robin/random/least-latency) | Config |
| - Avg Latency | ms | Health tracker |
| Model Mappings | `Table` alias → real model | `modelMappings` |
| Key Rotation | Key usage bars | Key selector state |
| Topology View | Optional: provider→model→key visual | |

### 4.6 Settings/Config

| Section | Component | Detail |
|---------|-----------|--------|
| Admin Auth | `Input` + password toggle | Change `admin_token` |
| Security Rules | `Form` + multi-select | Blocked/flagged PII types, injection threshold |
| Retry Policy | `Form` + number inputs | Max retries, delays, backoff |
| Default Rate Limits | `Form` | Default RPM/TPM/RPD |
| Provider Config | Dynamic form list | Add/edit/remove providers |
| Config Preview | `CodeBlock` TOML | Read-only preview of changes |

> **Note**: Settings page will be read-only (displaying current config derived from `config.toml`) since the gateway does not expose a write API for config changes. A future phase can add config-write endpoints.

## 5. Tech Stack

```
admin/
  package.json              # @vitejs/plugin-react, react 19, tailwindcss 4
  vite.config.ts            # proxy /admin/* → localhost:3000
  tailwind.config.ts        # shadcn/ui dark theme
  src/
    main.tsx                # ReactDOM entry
    App.tsx                 # Router + Layout
    lib/
      api-client.ts         # fetch wrapper with Bearer token
      auth.ts               # Token storage (localStorage)
    hooks/
      use-admin-keys.ts     # TanStack Query hooks
      use-audit-logs.ts
      use-audit-stats.ts
    components/
      ui/                   # shadcn/ui components (Card, Table, Dialog, etc.)
      layout/
        sidebar.tsx
        navbar.tsx
        page-header.tsx
    pages/
      overview.tsx
      keys.tsx
      audit.tsx
      security.tsx
      providers.tsx
      settings.tsx
```

**Key Dependencies**:
- `react` 19 + `react-router` 7
- `tailwindcss` 4 + `shadcn/ui` (dark theme)
- `@tanstack/react-query` for data fetching
- `recharts` for charts
- `@tanstack/react-table` for data tables
- `lucide-react` for icons
- `date-fns` for date formatting
- `vite` 6 for build tooling

## 6. Authentication Flow

1. User opens dashboard → sees login prompt (simple token input)
2. Token stored in `localStorage` under key `llm-gw-admin-token`
3. All API calls include `Authorization: Bearer <token>`
4. 401 response → clear token, redirect to login
5. No sessions — shared `admin_token` is the only auth mechanism

## 7. Implementation Phases

| Phase | Scope | Est. Files |
|-------|-------|------------|
| **P1: Foundation** | Vite project, layout, auth, routing, API client | ~15 |
| **P2: Overview** | KPI cards, charts, recent activity | ~8 |
| **P3: Keys** | Key CRUD table, create/edit dialogs, revoke | ~6 |
| **P4: Audit** | Filters, log table, detail drawer, export | ~8 |
| **P5: Security** | Security KPIs, threat feed, PII breakdown | ~6 |
| **P6: Providers** | Provider cards, model mapping table | ~5 |
| **P7: Settings** | Read-only config display | ~3 |
| **Total** | | ~51 files |

## 8. Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| `< 768px` (mobile) | Sidebar overlay, single-column cards, stacked tables |
| `768-1024px` (tablet) | Collapsed sidebar, 2-column grid |
| `1024-1440px` (desktop) | Full sidebar, 3-column grid |
| `> 1440px` (widescreen) | `max-w-7xl` centered content |
