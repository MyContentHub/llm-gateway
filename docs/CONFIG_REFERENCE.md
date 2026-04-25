# config.toml 配置文件说明

网关服务的所有配置均通过 `apps/gateway/config.toml` 管理，使用 [TOML](https://toml.io/) 格式，由 `smol-toml` 解析、`zod` 校验。

---

## 顶层配置项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `port` | integer | 否 | `3000` | 服务监听端口 |
| `host` | string | 否 | `"0.0.0.0"` | 服务监听地址 |
| `log_level` | enum | 否 | `"info"` | 日志级别，可选值：`fatal` / `error` / `warn` / `info` / `debug` / `trace` / `silent` |
| `database_path` | string | 否 | `"./data/gateway.db"` | SQLite 数据库文件路径 |
| `encryption_key` | string | 否 | `""` | 用于加密存储上游 API Key 的密钥（32 个十六进制字符 = 128-bit） |
| `admin_token` | string | **是** | — | 管理后台访问令牌，最小长度 1 |
| `default_rpm` | integer | 否 | `60` | 默认每分钟请求数限制（Requests Per Minute） |
| `default_tpm` | integer | 否 | `100000` | 默认每分钟 Token 数限制（Tokens Per Minute） |
| `default_rpd` | integer | 否 | `1000` | 默认每日请求数限制（Requests Per Day） |

### 示例

```toml
port = 3000
host = "0.0.0.0"
log_level = "info"
database_path = "./data/gateway.db"
encryption_key = "4c6ea943237382acc9c683b9cdb11a9f"
admin_token = "59e8947bd748122624f950f16f8859ff"
default_rpm = 60
default_tpm = 100000
default_rpd = 1000
```

---

## `[security]` — 安全扫描配置

控制 PII（个人身份信息）检测和注入攻击防护行为。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `injection_threshold` | number | 否 | `0.5` | 注入攻击检测阈值，范围 `0~1`，值越高判定越严格 |
| `blocked_pii_types` | string[] | 否 | `["SSN", "CREDIT_CARD"]` | 检测到后**直接拦截**请求的 PII 类型 |
| `flagged_pii_types` | string[] | 否 | `["EMAIL", "PHONE", "CN_ID", "BANK_CARD", "IP_ADDRESS", "DATE_OF_BIRTH", "PERSON", "PLACE", "ORGANIZATION"]` | 检测到后**标记但不拦截**的 PII 类型 |

### 支持的 PII 类型

| 类型标识 | 说明 |
|----------|------|
| `SSN` | 美国社会安全号码 |
| `CREDIT_CARD` | 信用卡号 |
| `EMAIL` | 电子邮件地址 |
| `PHONE` | 电话号码 |
| `CN_ID` | 中国身份证号 |
| `BANK_CARD` | 银行卡号 |
| `IP_ADDRESS` | IP 地址 |
| `DATE_OF_BIRTH` | 出生日期 |
| `PERSON` | 人名 |
| `PLACE` | 地名 |
| `ORGANIZATION` | 组织机构名 |

### 示例

```toml
[security]
injection_threshold = 0.6
blocked_pii_types = ["SSN", "CREDIT_CARD", "CN_ID"]
flagged_pii_types = ["EMAIL", "PHONE"]
```

---

## `[retry]` — 重试配置

控制请求失败后的自动重试行为。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `max_retries` | integer | 否 | `2` | 最大重试次数 |
| `initial_delay_ms` | integer | 否 | `1000` | 首次重试延迟（毫秒） |
| `max_delay_ms` | integer | 否 | `10000` | 最大重试延迟（毫秒） |
| `backoff_multiplier` | number | 否 | `2` | 退避倍数，每次重试延迟乘以此值 |

重试采用指数退避策略：`delay = min(initial_delay_ms × backoff_multiplier^attempt, max_delay_ms)`

### 示例

```toml
[retry]
max_retries = 3
initial_delay_ms = 500
max_delay_ms = 30000
backoff_multiplier = 2
```

---

## `[audit]` — 审计日志配置

控制审计日志的保留策略和清理计划。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `retention_days` | integer | 否 | `30` | 审计元数据保留天数 |
| `body_retention_days` | integer | 否 | `7` | 请求/响应体内容保留天数 |
| `cleanup_cron` | string | 否 | `"0 * * * *"` | 自动清理的 cron 表达式（默认每小时执行一次） |

### 示例

```toml
[audit]
retention_days = 90
body_retention_days = 14
cleanup_cron = "0 */6 * * *"
```

---

## `[[providers]]` — 上游服务提供商配置

使用 TOML 的数组表语法，可配置多个提供商。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | **是** | — | 提供商名称（不可为空） |
| `baseUrl` | string | **是** | — | 提供商 API 基础 URL（必须是合法 URL） |
| `apiKey` | string | **是** | — | 上游 API Key（单密钥模式） |
| `apiKeys` | string[] | 否 | — | 多密钥列表（多密钥模式，与 `apiKey` 二选一或同时使用） |
| `keyStrategy` | enum | 否 | `"round-robin"` | 多密钥轮换策略，可选值：`round-robin` / `random` / `least-latency` |
| `isDefault` | boolean | 否 | `false` | 是否为默认提供商（未匹配路由时的兜底） |
| `modelMappings` | table | 否 | `{}` | 模型名称映射表，将请求中的模型名映射到提供商的实际模型名 |

### keyStrategy 策略说明

| 策略 | 说明 |
|------|------|
| `round-robin` | 轮询，按顺序依次使用各个 Key |
| `random` | 随机选择一个 Key |
| `least-latency` | 选择最近延迟最低的 Key |

### 示例：单提供商 + 单密钥

```toml
[[providers]]
name = "zhipuai"
baseUrl = "https://open.bigmodel.cn/api/paas/v4"
apiKey = "your-api-key"
isDefault = true

[providers.modelMappings]
glm-5 = "glm-5"
gpt-4 = "glm-4"
```

### 示例：单提供商 + 多密钥

```toml
[[providers]]
name = "openai"
baseUrl = "https://api.openai.com/v1"
apiKey = "sk-primary-key"
apiKeys = ["sk-key-1", "sk-key-2", "sk-key-3"]
keyStrategy = "least-latency"
isDefault = true

[providers.modelMappings]
gpt-4 = "gpt-4"
gpt-4o = "gpt-4o"
```

### 示例：多提供商

```toml
[[providers]]
name = "openai"
baseUrl = "https://api.openai.com/v1"
apiKey = "sk-xxx"
isDefault = true

[[providers]]
name = "zhipuai"
baseUrl = "https://open.bigmodel.cn/api/paas/v4"
apiKey = "xxx.yyy"

[providers.modelMappings]
glm-4 = "glm-4"
```

---

## 完整配置示例

```toml
# 服务配置
port = 3000
host = "0.0.0.0"
log_level = "info"
database_path = "./data/gateway.db"
encryption_key = "4c6ea943237382acc9c683b9cdb11a9f"
admin_token = "59e8947bd748122624f950f16f8859ff"

# 默认速率限制
default_rpm = 60
default_tpm = 100000
default_rpd = 1000

# 安全扫描
[security]
injection_threshold = 0.5
blocked_pii_types = ["SSN", "CREDIT_CARD"]
flagged_pii_types = ["EMAIL", "PHONE", "CN_ID", "BANK_CARD", "IP_ADDRESS", "DATE_OF_BIRTH", "PERSON", "PLACE", "ORGANIZATION"]

# 重试策略
[retry]
max_retries = 2
initial_delay_ms = 1000
max_delay_ms = 10000
backoff_multiplier = 2

# 审计日志
[audit]
retention_days = 30
body_retention_days = 7
cleanup_cron = "0 * * * *"

# 提供商
[[providers]]
name = "zhipuai"
baseUrl = "https://open.bigmodel.cn/api/paas/v4"
apiKey = "your-api-key"
isDefault = true

[providers.modelMappings]
glm-5 = "glm-5"

[[providers]]
name = "openai"
baseUrl = "https://api.openai.com/v1"
apiKeys = ["sk-key-1", "sk-key-2", "sk-key-3"]
keyStrategy = "round-robin"
```

---

## 配置加载机制

1. 网关启动时通过 `loadConfig()` 读取 `config.toml`（默认路径为工作目录下的 `config.toml`）
2. 使用 `smol-toml` 将 TOML 文本解析为 JavaScript 对象
3. 通过 `zod` schema 严格校验，未填写的字段自动填充默认值
4. 校验失败会抛出错误并阻止启动
