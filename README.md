# LLM Gateway

LLM API 安全代理网关 — 对所有 OpenAI-Compatible API 提供商进行统一的请求拦截、安全扫描和监控审计。

网关对外暴露 OpenAI 兼容接口，你可以将任何使用 OpenAI SDK 的应用无缝切换到本网关，由网关负责路由到后端 LLM 提供商。

## 功能特性

- **OpenAI 兼容接口** — 代理 Chat Completions、Embeddings、Models 等 API
- **虚拟 API Key 管理** — 客户端使用网关颁发的虚拟 Key，上游 Key 加密存储
- **请求速率限制** — 按 Key 粒度的 RPM / TPM / RPD 限制
- **PII 检测与脱敏** — 自动识别并脱敏敏感信息（身份证、信用卡、邮箱等），响应时自动还原
- **Prompt 注入检测** — 基于 NLP 的注入攻击评分
- **内容过滤** — 可配置的输入内容拦截规则
- **审计日志** — 记录每次请求的模型、Token 用量、成本、延迟等元数据
- **Prometheus 指标** — 请求计数、Token 用量、成本分布、延迟直方图
- **多 Key 轮转** — 单个提供商支持多个 API Key，支持 round-robin / random / least-latency 策略
- **重试与故障转移** — 可配置的指数退避重试（429 / 5xx），支持跨提供商故障转移
- **生命周期钩子** — onRequest / preProxy / onResponse / onError 四个扩展点
- **优雅关闭** — SIGTERM / SIGINT 信号处理，等待在途请求完成后退出
- **Docker 部署** — 多阶段构建，非 root 用户，健康检查

## 架构

```
Client → [Auth] → [Rate Limit] → [PII Redact] → [Content Filter] → [Route] → [Upstream Proxy]
       ← [PII Restore] ← [Audit Log + Metrics] ←
```

## 技术栈

| 层面 | 选择 |
|------|------|
| 运行时 | Node.js 22+ (LTS) |
| 框架 | Fastify 5 |
| 语言 | TypeScript 5 (strict) |
| 数据库 | better-sqlite3 |
| 校验 | zod |
| 测试 | vitest (646 tests) |
| 日志 | pino |
| 指标 | prom-client |
| 配置 | TOML (smol-toml) |
| PII 检测 | compromise (NLP) + 正则 |
| Token 计数 | js-tiktoken |
| SSE 解析 | eventsource-parser |

## 快速开始

### 前置要求

- Node.js >= 22
- pnpm >= 10

### 安装

```bash
pnpm install
```

### 配置

复制 `config.example.toml` 为 `config.toml` 并填入配置：

```bash
cp config.example.toml config.toml
```

编辑 `config.toml`，配置你的 LLM 提供商。支持任何 OpenAI 兼容的 API 端点：

```toml
# Server
port = 3000
host = "0.0.0.0"
log_level = "info"

# Database
database_path = "./data/gateway.db"

# Encryption key for storing upstream API keys (32 hex chars = 128-bit)
encryption_key = "your-32-char-hex-key"

# Rate limits
default_rpm = 60
default_tpm = 100000
default_rpd = 1000

# Providers
[[providers]]
name = "zhipuai"
baseUrl = "https://open.bigmodel.cn/api/paas/v4"
apiKey = "your-api-key"
isDefault = true

[providers.modelMappings]
glm-5 = "glm-5"

# [[providers]]
# name = "deepseek"
# baseUrl = "https://api.deepseek.com/v1"
# apiKey = "sk-..."
#
# [providers.modelMappings]
# reasoner = "deepseek-reasoner"

# [[providers]]
# name = "openai"
# baseUrl = "https://api.openai.com/v1"
# apiKey = "sk-..."
#
# [providers.modelMappings]
# gpt4 = "gpt-4o"
# gpt4-mini = "gpt-4o-mini"

# [retry]
# max_retries = 2
# initial_delay_ms = 1000
# max_delay_ms = 10000
# backoff_multiplier = 2

# [security]
# injection_threshold = 0.5
# blocked_pii_types = ["SSN", "CREDIT_CARD"]
# flagged_pii_types = ["EMAIL", "PHONE", "CN_ID", "BANK_CARD", "IP_ADDRESS", "DATE_OF_BIRTH", "PERSON", "PLACE", "ORGANIZATION"]
```

#### 模型路由规则

1. 请求中的 `model` 字段优先在所有提供商的 `modelMappings` 中查找精确匹配
2. 如果没有匹配到映射，请求会路由到标记为 `isDefault: true` 的提供商（或第一个提供商）
3. 路由到提供商后，映射的 value（或原始 model 名）作为实际模型名发送给上游

### 启动

```bash
pnpm dev              # 开发模式（热重载）
pnpm build            # 编译 TypeScript
pnpm start            # 运行编译后的服务
```

服务默认监听 `http://0.0.0.0:3000`。

### Docker

```bash
docker compose up -d
```

数据持久化通过 Docker volume 自动管理，配置文件通过 `config.toml` 挂载。

## API 接口

### OpenAI 兼容接口

以下接口需要通过虚拟 API Key 认证（`Authorization: Bearer <virtual-key>`）：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | Chat 补全（支持流式 / 非流式） |
| `/v1/embeddings` | POST | 文本向量化 |
| `/v1/models` | GET | 列出所有已配置提供商的可用模型 |

### 网关接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/metrics` | GET | Prometheus 指标 |

### 管理 API

管理接口使用 `admin_token` 认证（`Authorization: Bearer <admin-token>`）：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/admin/keys` | POST | 创建虚拟 API Key |
| `/admin/keys` | GET | 列出所有 Key（分页） |
| `/admin/keys/:id` | GET | 获取单个 Key 详情 |
| `/admin/keys/:id` | PATCH | 更新 Key（名称、速率限制） |
| `/admin/keys/:id` | DELETE | 吊销 Key |
| `/admin/audit/logs` | GET | 查询审计日志（分页、过滤） |
| `/admin/audit/logs/:id` | GET | 获取单条审计日志详情 |
| `/admin/audit/stats` | GET | 审计统计信息 |

## 使用示例

### 1. 创建虚拟 API Key

```bash
curl -X POST http://localhost:3000/admin/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin-secret-key" \
  -d '{"name": "my-app", "rateLimits": {"rpm": 60, "tpm": 100000, "rpd": 1000}}'
```

返回：

```json
{
  "id": "key_abc123",
  "key": "vk-xxxxxxxxxxxxxxxx",
  "name": "my-app",
  "rateLimits": {"rpm": 60, "tpm": 100000, "rpd": 1000}
}
```

> `key` 仅在创建时返回一次，请妥善保存。`admin-secret-key` 为 `config.toml` 中的 `admin_token`。

### 2. 使用虚拟 Key 调用 API

非流式请求：

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer vk-xxxxxxxxxxxxxxxx" \
  -d '{
    "model": "glm-5",
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

流式请求：

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer vk-xxxxxxxxxxxxxxxx" \
  -d '{
    "model": "glm-5",
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "stream": true
  }'
```

### 3. OpenAI SDK (Python)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="vk-xxxxxxxxxxxxxxxx",
)

response = client.chat.completions.create(
    model="glm-5",
    messages=[{"role": "user", "content": "你好"}],
    stream=True,
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### 4. OpenAI SDK (Node.js)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3000/v1",
  apiKey: "vk-xxxxxxxxxxxxxxxx",
});

const stream = await client.chat.completions.create({
  model: "glm-5",
  messages: [{ role: "user", content: "你好" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

### 5. 查看可用模型

```bash
curl http://localhost:3000/v1/models \
  -H "Authorization: Bearer vk-xxxxxxxxxxxxxxxx"
```

### 6. 查看审计日志

```bash
curl "http://localhost:3000/admin/audit/logs?limit=10" \
  -H "Authorization: Bearer admin-secret-key"
```

### 7. 查看 Prometheus 指标

```bash
curl http://localhost:3000/metrics
```

## 配置参考

所有配置项都在 `config.toml` 中（参考 `config.example.toml`）：

### 全局配置

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `port` | `3000` | 服务端口 |
| `host` | `"0.0.0.0"` | 监听地址 |
| `log_level` | `"info"` | 日志级别：`fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent` |
| `database_path` | `"./data/gateway.db"` | SQLite 数据库路径 |
| `encryption_key` | `""` | 用于加密存储上游 API Key 的密钥（32 位十六进制） |
| `admin_token` | `"admin-secret-key"` | 管理 API 认证令牌 |
| `default_rpm` | `60` | 默认每分钟请求限制 |
| `default_tpm` | `100000` | 默认每分钟 Token 限制 |
| `default_rpd` | `1000` | 默认每日请求限制 |

### Provider 配置 (`[[providers]]`)

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 提供商标识名，用于模型列表前缀（如 `zhipuai/glm-5`） |
| `baseUrl` | 是 | 提供商的 OpenAI 兼容 API 根地址 |
| `apiKey` | 是 | 提供商的 API Key（单个） |
| `apiKeys` | 否 | 多个 API Key 数组（设置后优先于 `apiKey`） |
| `keyStrategy` | 否 | 多 Key 轮转策略：`round-robin`（默认）/ `random` / `least-latency` |
| `isDefault` | 否 | 设为 `true` 后，未匹配到任何映射的模型会路由到此提供商 |
| `[providers.modelMappings]` | 否 | 模型别名映射，key 为对外暴露的名称，value 为提供商的实际模型名 |

### 重试配置 (`[retry]`)

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `max_retries` | `2` | 最大重试次数（仅对 429 / 500 / 502 / 503 / 504 重试） |
| `initial_delay_ms` | `1000` | 初始退避延迟（毫秒） |
| `max_delay_ms` | `10000` | 最大退避延迟（毫秒） |
| `backoff_multiplier` | `2` | 退避倍数 |

### 安全配置 (`[security]`)

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `injection_threshold` | `0.5` | Prompt 注入检测阈值（0-1，超过则拦截） |
| `blocked_pii_types` | `["SSN", "CREDIT_CARD"]` | 检测到即拦截的 PII 类型 |
| `flagged_pii_types` | `["EMAIL", "PHONE", ...]` | 检测到即脱敏（不拦截）的 PII 类型 |

## 与 OpenCode 配合使用

本网关完全兼容 OpenAI API 格式，可以直接作为 [OpenCode](https://opencode.ai) 的自定义 Provider 使用。

### 方式一：自定义 Provider

在项目根目录创建 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "llm-gateway": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LLM Gateway",
      "options": {
        "baseURL": "http://localhost:3000/v1",
        "apiKey": "vk-xxxxxxxxxxxxxxxx"
      },
      "models": {
        "glm-5": {
          "name": "GLM-5"
        }
      }
    }
  },
  "model": "llm-gateway/glm-5"
}
```

### 方式二：覆写 Z.AI 内置 Provider

OpenCode 已内置 Z.AI（智谱）支持，可以直接将 `baseURL` 指向本网关：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "zai": {
      "options": {
        "baseURL": "http://localhost:3000/v1"
      }
    }
  },
  "model": "zai/glm-5"
}
```

使用此方式需先通过 `/connect` 命令配置 Z.AI 的 API Key（或设置 `ZAI_API_KEY` 环境变量），该 Key 会通过网关透传到智谱 AI。

> 无论哪种方式，都需要先启动网关服务（`pnpm dev`），OpenCode 的所有请求将通过网关路由到后端 LLM 提供商。

## 文档

- [设计文档](docs/DESIGN.md) — 完整架构设计与分阶段实施计划
- [OpenAI API 参考](docs/OPENAI_API_REFERENCE.md) — API 格式、SSE 生命周期、错误码

## 开发

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务器
pnpm test             # 运行全部测试
pnpm test:watch       # 监听模式运行测试
pnpm test:coverage    # 测试覆盖率
pnpm typecheck        # 类型检查
pnpm build            # TypeScript 编译
pnpm lint             # 代码检查
```

## License

MIT
