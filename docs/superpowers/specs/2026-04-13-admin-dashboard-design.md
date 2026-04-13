# LLM Gateway Admin Dashboard — Optimized Design

优化版管理后台设计。基于对后端 API 代码的完整审查，修正了数据映射、补充了缺失的后端 API 端点、降级了技术栈版本、明确了所有页面的数据来源。

## 1. 后端 API 层扩展

现有 admin API 只有 `/admin/keys` (CRUD) 和 `/admin/audit/logs` + `/admin/audit/stats`。为支撑全部 6 个页面，新增以下端点：

### 1.1 新增端点总览

| 端点 | 方法 | 用途 | 数据来源 |
|------|------|------|----------|
| `/admin/config` | GET | 返回当前运行配置（脱敏） | `AppConfig` |
| `/admin/providers` | GET | 列出所有 provider 配置 | `config.providers` |
| `/admin/providers/health` | GET | 各 provider key 的健康状态 | `KeyHealthTracker` |
| `/admin/audit/security` | GET | 安全聚合统计 | `audit_logs` 聚合查询 |

### 1.2 `GET /admin/config`

返回当前运行配置，**脱敏处理**：不返回 `encryption_key`、`admin_token`、provider 的 `apiKey`/`apiKeys`。

```json
{
  "port": 3000,
  "host": "0.0.0.0",
  "log_level": "info",
  "default_rpm": 60,
  "default_tpm": 100000,
  "default_rpd": 1000,
  "security": {
    "injection_threshold": 0.5,
    "blocked_pii_types": ["SSN", "CREDIT_CARD"],
    "flagged_pii_types": ["EMAIL", "PHONE", "CN_ID"]
  },
  "retry": {
    "max_retries": 2,
    "initial_delay_ms": 1000,
    "max_delay_ms": 10000,
    "backoff_multiplier": 2
  }
}
```

### 1.3 `GET /admin/providers`

列出所有 provider 配置。`keyCount` 代替实际 key 列表，不暴露 API key 值。

```json
{
  "providers": [
    {
      "name": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "keyStrategy": "round-robin",
      "keyCount": 3,
      "modelMappings": { "gpt4": "gpt-4-turbo" },
      "isDefault": true
    }
  ]
}
```

### 1.4 `GET /admin/providers/health`

各 provider 下每个 key 的健康状态。`id` 字段使用 `key-N` 格式（N 为该 provider 配置中 key 的索引位置），不暴露实际 API key 值。

```json
{
  "providers": [
    {
      "name": "openai",
      "keys": [
        { "id": "key-0", "avgLatency": 230, "consecutiveErrors": 0, "isHealthy": true },
        { "id": "key-1", "avgLatency": 450, "consecutiveErrors": 2, "isHealthy": true },
        { "id": "key-2", "avgLatency": 0, "consecutiveErrors": 5, "isHealthy": false }
      ]
    }
  ]
}
```

### 1.5 `GET /admin/audit/security`

安全聚合统计，支持 `?startDate&endDate` 参数。

后端聚合逻辑：
- `blockedRequests`：`WHERE status = 'blocked'` 的计数
- `piiDetections`：`WHERE pii_detected = 1`，`byType` 从 `pii_types_found` JSON 字段拆分聚合
- `injectionAttempts`：`WHERE prompt_injection_score > 0`，`scoreDistribution` 按 0.2 间隔分桶
- `contentFilter.allowed`：`WHERE status = 'success' AND pii_detected = 0 AND prompt_injection_score = 0`
- `contentFilter.flagged`：`WHERE status = 'success' AND (pii_detected = 1 OR prompt_injection_score > 0)`
- `contentFilter.blocked`：`WHERE status = 'blocked'`

```json
{
  "blockedRequests": 15,
  "piiDetections": {
    "total": 42,
    "byType": { "EMAIL": 18, "PHONE": 12, "SSN": 8, "CREDIT_CARD": 4 }
  },
  "injectionAttempts": {
    "total": 7,
    "avgScore": 0.72,
    "scoreDistribution": {
      "0-0.2": 1, "0.2-0.4": 0, "0.4-0.6": 2, "0.6-0.8": 3, "0.8-1.0": 1
    }
  },
  "contentFilter": { "allowed": 980, "flagged": 12, "blocked": 8 }
}
```

### 1.6 后端文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/routes/admin/config.ts` | 新增 | `/admin/config` + `/admin/providers` + `/admin/providers/health` 端点 |
| `src/proxy/health-tracker.ts` | 修改 | 添加 `getAllHealth()` 方法，按 provider 分组返回 |
| `src/db/audit-store.ts` | 修改 | 添加 `querySecurityStats(startDate?, endDate?)` 方法 |
| `src/types.ts` | 修改 | 添加 `healthTracker` decoration 声明 |
| `src/index.ts` | 修改 | 挂载 `healthTracker` 到 server，注册新插件 |
| `src/plugins/serve-admin.ts` | 新增 | `@fastify/static` 服务 admin 前端构建产物 |

## 2. 架构与技术栈

### 2.1 项目结构

```
llm-gateway/
  admin/                          # 独立 Vite + React 前端子包
    package.json
    tsconfig.json
    vite.config.ts
    tailwind.config.ts
    postcss.config.js
    index.html
    src/
      main.tsx
      App.tsx
      lib/
        api-client.ts             # fetch wrapper: Bearer token, 错误处理, baseURL
        auth.ts                   # token 存取 (localStorage)
        utils.ts                  # 格式化: 数字缩写, USD, 毫秒, 日期
      hooks/
        use-auth.ts               # 认证状态 hook
        use-keys.ts               # TanStack Query: keys CRUD
        use-audit-logs.ts         # TanStack Query: audit logs + stats
        use-audit-security.ts     # TanStack Query: security stats
        use-providers.ts          # TanStack Query: providers + health
        use-config.ts             # TanStack Query: config
      components/
        ui/                       # shadcn/ui 组件 (按需安装)
        layout/
          sidebar.tsx
          navbar.tsx
          page-header.tsx
          auth-guard.tsx          # 认证守卫
        charts/
          bar-chart.tsx
          pie-chart.tsx
          donut-chart.tsx
          histogram.tsx
        data-table.tsx            # TanStack Table + shadcn 封装
      pages/
        login.tsx
        overview.tsx
        keys.tsx
        keys/create-dialog.tsx
        keys/edit-sheet.tsx
        audit.tsx
        audit/detail-drawer.tsx
        audit/export.ts
        security.tsx
        providers.tsx
        providers/topology.tsx
        settings.tsx
  src/                            # 主项目后端
    routes/admin/
      config.ts                   # 新增
      keys.ts                     # 已有
      audit.ts                    # 已有
    plugins/
      serve-admin.ts              # 新增
```

### 2.2 技术栈（稳定版）

| 依赖 | 版本 | 说明 |
|------|------|------|
| React | 18.x | 稳定版 |
| react-router-dom | v6.x | 当前主流 |
| Tailwind CSS | v3.x | shadcn/ui 官方支持 |
| Vite | v5.x | 稳定版 |
| @tanstack/react-query | v5 | 服务端状态管理 |
| @tanstack/react-table | v8 | 数据表格 |
| recharts | 2.x | 图表 |
| lucide-react | latest | 图标 |
| date-fns | v3 | 日期处理 |
| shadcn/ui | latest | 组件库 (Tailwind v3 模式) |

### 2.3 关键架构决策

**API Client**：单例 `apiClient`，baseURL 从环境变量 `VITE_API_BASE` 读取，默认 `""`（同源）。自动附加 `Authorization: Bearer <token>` 头。401 响应自动清除 token 并跳转登录页。错误格式与后端 OpenAI 风格一致：`{ error: { message, type, code } }`。

**路由**：
```
/login                    # Token 输入页
/                         # Overview Dashboard
/keys                     # API Key 管理
/audit                    # 审计日志
/security                 # 安全监控
/providers                # Provider 状态
/settings                 # 配置查看
```

**状态管理**：服务端状态全部用 TanStack Query（按资源拆分 hook）。客户端状态仅认证 token 和 sidebar 折叠状态，用 React context + localStorage。不引入额外的全局状态库。

**构建产物**：`pnpm build` 输出到 `admin/dist/`，后端通过 `@fastify/static` 在 `/admin` 路径下服务。SPA 路由回退：所有 `/admin/**` 非 API 请求返回 `index.html`。

## 3. 设计系统

沿用深色主题 token：

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

## 4. 布局

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

- **Sidebar**：可折叠，240px / 64px (icon-only)，固定定位，当前页高亮指示器
- **Navbar**：浮动，provider 健康指示器 + 退出按钮
- **Content**：去掉 `max-w-7xl` 限制，宽屏下数据表格获得更多空间
- **Mobile**：Sidebar 变为汉堡菜单覆盖层

### 响应式断点

| 断点 | 行为 |
|------|------|
| `< 768px` | Sidebar 覆盖层，单列卡片，表格堆叠 |
| `768-1024px` | 折叠 Sidebar，2 列网格 |
| `1024-1440px` | 完整 Sidebar，3 列网格 |
| `> 1440px` | 全宽内容区 |

## 5. 页面功能设计

### 5.1 Login

独立 `/login` 页面，居中卡片布局。单一 admin token 输入框。

**验证流程**：输入 token → 调用 `GET /admin/config` → 200 则存入 localStorage 跳转 Overview → 401 则显示"Token 无效"。

**数据来源**：`GET /admin/config`（同时验证 token + 缓存初始配置）。

### 5.2 Overview Dashboard

| 组件 | API | 字段 |
|------|-----|------|
| KPI Cards (4): Total Requests, Token Usage, Total Cost, Avg Latency | `GET /admin/audit/stats` | `totalRequests`, `totalTokens`, `totalCostUsd`, `avgLatencyMs` |
| KPI delta change | `GET /admin/audit/stats?startDate=<yesterday>` | 前端计算差值 |
| By Model 柱状图 | 同上 | `byModel` |
| By Status 饼图 | 同上 | `byStatus` |
| Recent Activity 表格 | `GET /admin/audit/logs?limit=5` | 最新 5 条 |
| PII Detection Rate 环形进度 | 同上 stats | `piiDetectionRate` |

### 5.3 API Key Management

| 操作 | API | 说明 |
|------|-----|------|
| 列表 | `GET /admin/keys?offset=0&limit=20` | `{ keys: [...], total }` |
| 创建 | `POST /admin/keys` | body: `{ name, rateLimits? }` → 返回含 `key` 明文 |
| 编辑 | `PATCH /admin/keys/:id` | body: `{ name?, rateLimits? }` |
| 吊销 | `DELETE /admin/keys/:id` | 返回 `{ success: true }` |

**表格列**：Name, ID, Key Prefix, Rate Limits (RPM/TPM/RPD), Created, Status

**交互**：
- 创建后弹窗显示 key 明文（只显示一次）+ 复制按钮
- 编辑：右侧 Sheet 面板
- 吊销：AlertDialog 二次确认
- Status Badge：`revoked_at !== null` → Revoked（红色），否则 Active（绿色）

### 5.4 Audit Log Browser

| 组件 | API | 说明 |
|------|-----|------|
| 过滤栏枚举 | `GET /admin/audit/stats` (model 列表) + `GET /admin/keys` (key 列表) | 下拉选项来源 |
| 日志表格 | `GET /admin/audit/logs?startDate&endDate&model&endpoint&status&api_key_id&limit&offset` | 分页 |
| 详情抽屉 | `GET /admin/audit/logs/:requestId` | 完整行数据含 `content_hash_sha256` |
| CSV 导出 | 前端分批 fetch 全量数据 | 客户端生成 CSV |

**表格列**：Time, Request ID, Key, Model, Tokens, Cost, Latency, Status, PII

**Status Badge 映射**：`success` → 绿色，`error` → 红色，`blocked` → 橙色。

**PII Indicator**：`Badge` + tooltip 显示检测到的 PII 类型列表。

**Injection Score**：进度条，`prompt_injection_score` (0-1) 乘 100 显示百分比，颜色梯度 green→orange→red。

### 5.5 Security Monitor

| 组件 | API | 字段 |
|------|-----|------|
| Security KPIs (4) | `GET /admin/audit/security` | `blockedRequests`, `piiDetections.total`, `injectionAttempts.total`, `contentFilter` 合计 |
| KPI trend | 两次调用（当期 vs 上期） | 前端计算差值 |
| Threat Feed | `GET /admin/audit/logs?status=blocked` | 复用审计日志 API |
| PII Type 横向柱状图 | security stats `piiDetections.byType` | `{ EMAIL: 18, PHONE: 12, ... }` |
| Injection Score 分布 | security stats `injectionAttempts.scoreDistribution` | 5 个桶直方图 |

### 5.6 Provider/Model Status

| 组件 | API | 说明 |
|------|-----|------|
| Provider Cards | `GET /admin/providers` | `name, baseUrl, keyStrategy, keyCount, modelMappings, isDefault` |
| Health 指示灯 | `GET /admin/providers/health` | 每个 key 的 `isHealthy, avgLatency, consecutiveErrors` |
| Model Mappings 表格 | providers 的 `modelMappings` | `{ "gpt4": "gpt-4-turbo" }` |
| Key Usage 分布条 | providers health | 所有 key 的 latency 对比 |
| Topology View | 综合以上两个 API | Provider → Model Mapping → Key 健康 SVG 流程图 |

**Provider Card 健康聚合**：全部 healthy → 绿色，有 unhealthy → 黄色，全部 unhealthy → 红色。

### 5.7 Settings/Config

**只读展示**，无编辑功能。

| 区域 | API | 说明 |
|------|-----|------|
| 通用配置 | `GET /admin/config` | port, host, log_level, default rate limits |
| 安全规则 | config `security` 字段 | injection_threshold, blocked/flagged PII types |
| 重试策略 | config `retry` 字段 | max_retries, delays, backoff |
| Provider 配置 | `GET /admin/providers` | 各 provider 详情 |
| TOML 预览 | 前端格式化 | 从 JSON 数据前端渲染为 TOML 文本 |

每个配置区块用 `Card` + 描述列表展示键值对。

## 6. 认证流程

1. 用户访问任意 `/admin/**` 路径 → `AuthGuard` 检查 localStorage
2. 无 token → 重定向 `/login`
3. 输入 admin token → 调用 `GET /admin/config` 验证
4. 200 → token 存入 `localStorage`（key: `llm-gw-admin-token`），跳转 Overview
5. 401 → 显示"Token 无效"
6. 后续所有 API 请求自动附加 `Authorization: Bearer <token>`
7. 任何 API 返回 401 → 清除 token，跳转 `/login`
8. Navbar 退出按钮 → 清除 token，跳转 `/login`

## 7. 部署方案

### 开发环境

- `admin/` 下 `pnpm dev` 启动 Vite dev server（端口 5173）
- `vite.config.ts` 配置 proxy：
  ```ts
  server: {
    proxy: {
      '/admin': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    }
  }
  ```
- 主项目 `pnpm dev` 启动 Fastify（端口 3000）
- CORS 由 `@fastify/cors` 处理

### 生产环境

- `admin/` 执行 `pnpm build` → `admin/dist/`
- 后端注册 `@fastify/static`（`src/plugins/serve-admin.ts`）：
  - URL 前缀 `/admin`
  - SPA 回退：非 API 路径返回 `index.html`
  - JS/CSS 缓存 `max-age: 1y`（Vite 内容哈希）
  - 仅在 `admin/dist/` 存在时启用
- 部署只需一个 Node.js 进程

## 8. 实施阶段

| 阶段 | 后端 | 前端 | 预估文件 |
|------|------|------|----------|
| **P1: 基础设施** | healthTracker decoration + `/admin/config` + `/admin/providers` | Vite 初始化 + 路由 + Layout + 认证 + API Client | 后端 ~3, 前端 ~15 |
| **P2: Overview** | 无 | KPI Cards + 图表 + Recent Activity | ~8 |
| **P3: Keys** | 无 | Key CRUD + 创建/编辑/吊销 | ~6 |
| **P4: Audit** | 无 | 过滤 + 表格 + 详情 + CSV | ~8 |
| **P5: Security** | `/admin/audit/security` + AuditStore 聚合 | Security KPIs + Threat Feed + 图表 | 后端 ~2, 前端 ~6 |
| **P6: Providers** | `/admin/providers/health` + healthTracker 扩展 | Provider Cards + Health + Topology | 后端 ~1, 前端 ~5 |
| **P7: Settings** | 无 | 只读配置 + TOML 预览 | ~3 |
| **P8: 部署集成** | `@fastify/static` 插件 | 构建验证 | 后端 ~1 |
| **合计** | ~7 文件 | ~51 文件 | ~58 |

## 9. 前端完整依赖

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.28.0",
    "@tanstack/react-query": "^5.62.0",
    "@tanstack/react-table": "^8.20.0",
    "recharts": "^2.15.0",
    "lucide-react": "^0.460.0",
    "date-fns": "^3.6.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

后端新增依赖：`@fastify/static`。
