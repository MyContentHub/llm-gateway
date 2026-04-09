# LLM API 安全代理网关 — 设计方案

## 项目定位

通用 LLM API 安全代理网关 — 对所有 OpenAI-Compatible API 提供商进行统一的请求拦截、安全扫描和监控审计。

## 现有开源方案对比

| 方案 | 语言 | 特点 | 局限性 |
|------|------|------|--------|
| LiteLLM (42k stars) | Python | 100+ 模型、虚拟Key、成本追踪、8ms P95 | Python 生态，企业 Guardrails 收费 |
| Portkey Gateway (11k stars) | TypeScript | 122kb 体积、<1ms 延迟、40+ Guardrails、配置驱动 | PII redaction 为企业功能 |
| One API (23k stars) | Go+React | API Key 分发管理、多渠道负载均衡 | 安全扫描能力弱 |
| LLM Guard (2.8k stars) | Python | 15 输入扫描器 + 21 输出扫描器，PII 检测业界标杆 | 非代理，需作为 API 集成 |
| Guardrails AI (6.7k stars) | Python | 100+ 验证器 Hub，OpenAI 兼容代理模式 | Python 生态 |

## 架构总览

```
Client ──▶ [Auth] ──▶ [Rate Limit] ──▶ [PII Redact]
         ──▶ [Content Filter] ──▶ [Route] ──▶ [Upstream Proxy]
         ──▶ [PII Restore] ──▶ [Audit Log] ──▶ Client
```

### 核心模块

1. **认证层** — 虚拟 API Key（argon2 哈希存储）→ 内存缓存热查询
2. **限流层** — 滑动窗口算法（内存），支持 RPM/TPM/RPD
3. **PII 检测 & 脱敏** — `compromise`(NLP) + 自定义正则 → 替换为 `[SSN_1]` 占位符 → 映射仅存于请求上下文，不持久化
4. **内容过滤** — 正则(注入模式) → 启发式评分 → 可选 ML 分类器
5. **路由转发** — 模型别名映射、多 Key 轮询、负载均衡
6. **流式处理** — Web Streams API + `eventsource-parser`，TransformStream 逐 chunk 检查/修改
7. **审计日志** — 仅记录元数据（模型、Token数、成本、PII类型、风险分数），不存储原始内容，用 SHA-256 做内容去重
8. **API Key 管理** — 上游 Key 用 AES-256-GCM 加密存 DB，客户端用虚拟 Key

## 技术栈

| 层面 | 选择 | 理由 |
|------|------|------|
| 运行时 | Node.js 20+ (LTS) | 原生 fetch、Web Streams |
| 框架 | Fastify 5 | 比 Express 快 2-3x，内置 JSON Schema 验证、生命周期 Hook |
| 语言 | TypeScript 5 (strict) | 类型安全 |
| SSE 解析 | eventsource-parser | 零依赖，处理行碎片 |
| Token 计数 | js-tiktoken | OpenAI tokenizer 的纯 JS/WASM 实现 |
| PII | compromise + 自定义正则 | 轻量 NLP + 精确模式匹配 |
| 校验 | zod | 类型安全的 Schema 验证 |
| 日志 | pino | 结构化 JSON 日志（Fastify 默认） |
| 指标 | prom-client | Prometheus 导出 |
| 缓存 | 内存 LRU（单节点） | 零依赖，单节点够用 |
| 数据库 | better-sqlite3 | 单文件，零运维 |
| 加密 | @nodejs/crypto (内置) | AES-256-GCM |
| 测试 | vitest | 快速，TypeScript 原生支持 |

## 项目结构

```
llm-proxy/
├── src/
│   ├── index.ts                  # 入口，Fastify 启动
│   ├── config/
│   │   ├── index.ts              # zod 解析 env + 配置文件
│   │   └── providers.ts          # 提供商注册（baseUrl、key、模型映射）
│   ├── routes/
│   │   ├── v1/
│   │   │   ├── chat-completions.ts
│   │   │   ├── completions.ts
│   │   │   ├── embeddings.ts
│   │   │   └── models.ts
│   │   └── admin/
│   │       ├── keys.ts           # 虚拟 Key CRUD
│   │       └── audit.ts          # 审计日志查询
│   ├── middleware/
│   │   ├── auth.ts               # API Key 认证
│   │   ├── rate-limit.ts         # 限流（内存滑动窗口）
│   │   └── request-context.ts    # 请求作用域上下文（PII 映射等）
│   ├── proxy/
│   │   ├── forwarder.ts          # 核心转发逻辑（streaming + non-streaming）
│   │   ├── sse-parser.ts         # SSE 流解析器（TransformStream）
│   │   └── router.ts             # 模型→提供商路由
│   ├── security/
│   │   ├── pii-scanner.ts        # compromise + 正则 PII 检测/脱敏
│   │   ├── pii-patterns.ts       # 内置 PII 模式库（SSN、邮箱、手机、身份证等）
│   │   ├── content-filter.ts     # 内容过滤（注入检测、敏感词）
│   │   └── tokenizer.ts          # js-tiktoken Token 计数
│   ├── audit/
│   │   ├── logger.ts             # 审计日志写入（元数据 only）
│   │   └── schema.ts             # 审计日志 Schema
│   ├── db/
│   │   ├── index.ts              # better-sqlite3 初始化 + migration
│   │   ├── keys.ts               # Key 存储（argon2 哈希）
│   │   └── audit-store.ts        # 审计日志存储
│   └── utils/
│       ├── crypto.ts             # AES-256-GCM 加密工具
│       └── cost.ts               # Token 成本计算
├── migrations/
│   └── 001-init.sql              # 建表（keys、audit_logs、providers）
├── package.json
├── tsconfig.json
├── .env.example
└── vitest.config.ts
```

## 分阶段实施

### Phase 1: 核心代理（MVP）

1. Fastify 服务 + TypeScript 项目初始化
2. 配置系统（zod + .env）：提供商 baseUrl + API Key
3. `/v1/chat/completions` 代理转发（non-streaming）
4. `/v1/chat/completions` 代理转发（streaming SSE）— 核心难点
5. `/v1/models` 透传
6. `/v1/embeddings` 透传
7. 模型→提供商路由（配置文件驱动）

### Phase 2: 认证 & 限流

8. 虚拟 API Key 系统（SQLite + argon2）
9. 请求认证中间件
10. 内存滑动窗口限流（RPM/TPM）
11. Admin API（Key CRUD）

### Phase 3: 安全扫描

12. PII 检测模块（compromise + 正则模式库）
13. PII 脱敏/还原管道（请求作用域映射）
14. Prompt 注入启发式检测
15. 内容过滤规则引擎

### Phase 4: 审计 & 监控

16. 审计日志（元数据 only + SHA-256 hash）
17. Token 用量统计 & 成本计算
18. Prometheus 指标导出
19. 审计日志查询 API

### Phase 5: 增强

20. 请求/响应 Hook 插件系统
21. 多 Key 轮询 & 负载均衡
22. 重试 & 故障转移
23. Docker 部署

## 关键设计决策

| 决策点 | 方案 |
|--------|------|
| 提供商接入 | 纯配置驱动，任何 baseUrl 即可接入，不做 per-provider 适配 |
| 流式处理 | Web Streams API + TransformStream，逐 chunk 处理 |
| PII | compromise NLP + 中英文正则（邮箱/手机/身份证/银行卡/SSN），内置不依赖外部 |
| 存储 | better-sqlite3 单文件，零运维 |
| Key 安全 | 客户端 Key: argon2 哈希; 上游 Key: AES-256-GCM 加密存 DB |
| 审计 | 仅元数据 + 风险分数，不存原始 prompt/response |

## 关键实现模式

### 流式 SSE 代理（核心难点）

```typescript
const transform = new TransformStream({
  transform(chunk, controller) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') { controller.enqueue(...); continue }
        const parsed = JSON.parse(data)
        const processed = applyOutputHooks(parsed)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(processed)}\n\n`))
      }
    }
  }
})
```

### PII 脱敏/还原流程

```
原始: "My SSN is 123-45-6789" → 脱敏: "My SSN is [SSN_1]"
  ↓ 映射 { "[SSN_1]": "123-45-6789" } 仅在请求作用域内存
LLM 返回: "Noted your [SSN_1]" → 还原: "Noted your 123-45-6789"
```

### 审计日志格式（不存原文）

```json
{
  "request_id": "uuid",
  "timestamp": "2026-04-09T04:00:00Z",
  "api_key_id": "key_abc123",
  "model": "gpt-4o",
  "endpoint": "/v1/chat/completions",
  "prompt_tokens": 1234,
  "completion_tokens": 567,
  "cost_usd": 0.0234,
  "latency_ms": 1234,
  "status": "success",
  "pii_detected": true,
  "pii_types_found": ["EMAIL", "PHONE"],
  "prompt_injection_score": 0.12,
  "content_hash_sha256": "abc123..."
}
```

## 参考

- Portkey Gateway (TypeScript AI Gateway): https://github.com/Portkey-AI/gateway
- LiteLLM (Python AI Gateway): https://github.com/BerriAI/litellm
- LLM Guard (Security Scanners): https://github.com/protectai/llm-guard
- OpenAI API Spec: https://github.com/openai/openai-openapi
