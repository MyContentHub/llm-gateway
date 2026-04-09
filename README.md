# LLM Gateway

LLM API 安全代理网关 — 对所有 OpenAI-Compatible API 提供商进行统一的请求拦截、安全扫描和监控审计。

网关对外暴露 OpenAI 兼容接口，你可以将任何使用 OpenAI SDK 的应用无缝切换到本网关，由网关负责路由到后端 LLM 提供商。

## 架构

```
Client → [Auth] → [Rate Limit] → [PII Redact] → [Content Filter] → [Route] → [Upstream Proxy]
       ← [PII Restore] ← [Audit Log] ←
```

## 技术栈

| 层面 | 选择 |
|------|------|
| 运行时 | Node.js 22+ (LTS) |
| 框架 | Fastify 5 |
| 语言 | TypeScript 5 (strict) |
| 数据库 | better-sqlite3 |
| 校验 | zod |
| 测试 | vitest |
| 日志 | pino |
| 指标 | prom-client |

## 快速开始

### 前置要求

- Node.js >= 22
- pnpm >= 10

### 安装

```bash
pnpm install
```

### 配置

复制 `.env.example` 为 `.env` 并填入配置：

```bash
cp .env.example .env
```

在 `PROVIDERS` 中配置你的 LLM 提供商。支持任何 OpenAI 兼容的 API 端点：

```env
PROVIDERS=[
  {
    "name": "zhipuai",
    "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
    "apiKey": "your-api-key",
    "isDefault": true,
    "modelMappings": {
      "glm-5": "glm-5"
    }
  },
  {
    "name": "deepseek",
    "baseUrl": "https://api.deepseek.com/v1",
    "apiKey": "sk-...",
    "modelMappings": {
      "reasoner": "deepseek-reasoner"
    }
  },
  {
    "name": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-...",
    "modelMappings": {
      "gpt4": "gpt-4o",
      "gpt4-mini": "gpt-4o-mini"
    }
  }
]
```

#### 配置说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 提供商标识名，用于模型列表前缀（如 `zhipuai/glm-5`） |
| `baseUrl` | 是 | 提供商的 OpenAI 兼容 API 根地址 |
| `apiKey` | 是 | 提供商的 API Key |
| `isDefault` | 否 | 设为 `true` 后，未匹配到任何映射的模型会路由到此提供商 |
| `modelMappings` | 否 | 模型别名映射，key 为对外暴露的名称，value 为提供商的实际模型名 |

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

## API 接口

网关完全兼容 OpenAI API 格式，以下接口可直接使用：

| 接口 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | Chat 补全（支持流式 / 非流式） |
| `/v1/embeddings` | POST | 文本向量化 |
| `/v1/models` | GET | 列出所有已配置提供商的可用模型 |
| `/health` | GET | 健康检查 |

## 使用示例

### curl

非流式请求：

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
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
  -d '{
    "model": "glm-5",
    "messages": [
      {"role": "user", "content": "你好"}
    ],
    "stream": true
  }'
```

### OpenAI SDK (Python)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="unused"  # 网关暂不校验 key，可填任意值
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

### OpenAI SDK (Node.js)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3000/v1",
  apiKey: "unused",
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

### 查看可用模型

```bash
curl http://localhost:3000/v1/models
```

返回的模型 ID 格式为 `{providerName}/{modelName}`，如 `zhipuai/glm-5`。

## 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `LOG_LEVEL` | `info` | 日志级别：`fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent` |
| `PROVIDERS` | `[]` | 提供商配置（JSON 数组） |
| `DATABASE_PATH` | `./data/gateway.db` | SQLite 数据库路径 |
| `ENCRYPTION_KEY` | — | 用于加密存储上游 API Key 的密钥（32 位十六进制） |
| `DEFAULT_RPM` | `60` | 默认每分钟请求限制 |
| `DEFAULT_TPM` | `100000` | 默认每分钟 Token 限制 |

## 文档

- [设计文档](docs/DESIGN.md) — 完整架构设计与分阶段实施计划
- [OpenAI API 参考](docs/OPENAI_API_REFERENCE.md) — API 格式、SSE 生命周期、错误码

## 开发

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务器
pnpm test             # 运行测试
pnpm test:watch       # 监听模式运行测试
pnpm test:coverage    # 测试覆盖率
pnpm build            # TypeScript 编译
pnpm typecheck        # 类型检查
pnpm lint             # 代码检查
```

## License

MIT
