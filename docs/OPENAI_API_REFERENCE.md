# OpenAI API Reference for LLM Proxy

Source: OpenAI OpenAPI Spec v2.3.0 (https://github.com/openai/openai-openapi)

---

## 1. Authentication

All endpoints use **Bearer token auth** via `Authorization` header:

```
Authorization: Bearer $OPENAI_API_KEY
```

The security scheme is defined as `ApiKeyAuth: type: http, scheme: bearer`.

For Azure OpenAI, use `api-key` header instead.

---

## 2. Core Endpoints

### 2.1 Chat Completions — `POST /v1/chat/completions`

**Request body** (`application/json`):

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `model` | string | **yes** | — | Model ID (e.g. `gpt-4o`, `gpt-4o-mini`, `o3`, `gpt-5.4`) |
| `messages` | array | **yes** | — | List of message objects (min 1 item) |
| `stream` | boolean | no | `false` | Enable SSE streaming |
| `temperature` | number | no | `1` | Sampling temperature |
| `top_p` | number | no | `1` | Nucleus sampling |
| `n` | integer | no | `1` | Number of choices (max 128) |
| `max_tokens` | integer | no | null | **Deprecated** — use `max_completion_tokens` |
| `max_completion_tokens` | integer | no | null | Upper bound for output tokens (includes reasoning tokens) |
| `stop` | string \| array | no | null | Up to 4 stop sequences |
| `presence_penalty` | number | no | `0` | -2.0 to 2.0 |
| `frequency_penalty` | number | no | `0` | -2.0 to 2.0 |
| `logit_bias` | object | no | null | Map of token_id → bias (-100 to 100) |
| `logprobs` | boolean | no | `false` | Return log probabilities |
| `top_logprobs` | integer | no | null | 0-20 top logprobs per position |
| `response_format` | object | no | null | `{ "type": "json_object" }` or `{ "type": "json_schema", "json_schema": {...} }` |
| `seed` | integer | no | null | Deterministic sampling (beta) |
| `tools` | array | no | — | List of tool definitions |
| `tool_choice` | string \| object | no | `auto` | `"none"`, `"auto"`, `"required"`, or specific tool |
| `parallel_tool_calls` | boolean | no | `true` | Allow parallel tool calls |
| `stream_options` | object | no | null | `{ "include_usage": true }` to get usage in last chunk |
| `store` | boolean | no | `false` | Store completion for distillation/evals |
| `modalities` | array | no | `["text"]` | e.g. `["text", "audio"]` |
| `audio` | object | no | null | Audio output config: `{ "voice": "alloy", "format": "mp3" }` |
| `reasoning_effort` | string | no | null | For o-series: `"low"`, `"medium"`, `"high"` |
| `prediction` | object | no | null | Predicted output for faster responses |
| `web_search_options` | object | no | null | Enable web search tool |
| `user` | string | no | null | End-user identifier |
| `metadata` | object | no | null | Key-value metadata for stored completions |
| `service_tier` | string | no | `"auto"` | `"auto"` or `"default"` |

**Message types** (in `messages` array):
- `{"role": "system", "content": "..."}` — system instructions
- `{"role": "developer", "content": "..."}` — developer instructions (replaces system for newer models)
- `{"role": "user", "content": "..."}` — user message (string or array of content parts)
- `{"role": "assistant", "content": "..."}` — assistant response
- `{"role": "tool", "content": "...", "tool_call_id": "..."}` — tool result

**Content parts** (for multimodal messages):
```json
[
  {"type": "text", "text": "What is in this image?"},
  {"type": "image_url", "image_url": {"url": "https://..."}}
]
```

**Non-streaming response** (`application/json`):

```json
{
  "id": "chatcmpl-B9MBs8CjcvOU2jLn4n570S5qMJKcT",
  "object": "chat.completion",
  "created": 1741569952,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I assist you today?",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 10,
    "total_tokens": 29,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_44709d6fcb"
}
```

**Required response fields**: `id`, `object`, `created`, `model`, `choices`

**`finish_reason` values**: `stop`, `length`, `tool_calls`, `content_filter`, `function_call`

---

### 2.2 Streaming Chat Completions (SSE)

When `stream: true`, the response uses `Content-Type: text/event-stream`.

**SSE wire format** — each chunk is:

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4o-mini","system_fingerprint":"fp_44709d6fcb","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}\n\n
```

**Stream lifecycle**:

1. **First chunk** — `delta` contains `{"role": "assistant", "content": ""}`
2. **Content chunks** — `delta` contains `{"content": "token text"}`
3. **Tool call chunks** — `delta` contains `{"tool_calls": [{"index": 0, "id": "...", "type": "function", "function": {"name": "get_weather", "arguments": ""}}]}`
   - Subsequent chunks have partial `arguments` strings that must be concatenated
4. **Final chunk** — `finish_reason: "stop"` (or other value), `delta: {}`
5. **Usage chunk** (if `stream_options: {include_usage: true}`) — `choices: []`, `usage: {...}`
6. **Termination signal**: `data: [DONE]\n\n`

**Chunk schema** (`chat.completion.chunk`):

| Field | Type | Description |
|---|---|---|
| `id` | string | Same ID across all chunks |
| `object` | string | Always `"chat.completion.chunk"` |
| `created` | integer | Unix timestamp (same across all chunks) |
| `model` | string | Model ID |
| `system_fingerprint` | string | Backend fingerprint |
| `choices` | array | May be empty `[]` on usage-only chunk |
| `choices[].index` | integer | Choice index |
| `choices[].delta` | object | Incremental content (see delta schema below) |
| `choices[].delta.content` | string \| null | Text fragment |
| `choices[].delta.role` | string | Role (only in first chunk) |
| `choices[].delta.tool_calls` | array | Tool call fragments |
| `choices[].delta.refusal` | string \| null | Refusal message |
| `choices[].finish_reason` | string \| null | Null until final chunk |
| `choices[].logprobs` | object \| null | Log probabilities |
| `usage` | object \| null | Only on last chunk with `include_usage` |

**Critical SSE parsing rules for a proxy**:
- Lines starting with `data: ` contain JSON payloads
- Empty lines (`\n\n`) separate events
- The string `data: [DONE]` signals end of stream — **do not parse as JSON**
- Some providers may include `data: {"error":...}` mid-stream for errors
- Buffer partial lines — SSE events can be split across TCP packets

---

### 2.3 Legacy Completions — `POST /v1/completions`

**Request body** (`application/json`):

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | string | yes | `gpt-3.5-turbo-instruct`, `davinci-002`, `babbage-002` |
| `prompt` | string \| array | no | Text prompt(s) |
| `max_tokens` | integer | no | Max tokens to generate |
| `temperature` | number | no | Sampling temperature |
| `top_p` | number | no | Nucleus sampling |
| `n` | integer | no | Number of completions |
| `stream` | boolean | no | Enable streaming |
| `logprobs` | integer | no | Include log probabilities |
| `echo` | boolean | no | Echo prompt back |
| `stop` | string \| array | no | Stop sequences |
| `presence_penalty` | number | no | Presence penalty |
| `frequency_penalty` | number | no | Frequency penalty |
| `best_of` | integer | no | Return best completion from N |
| `logit_bias` | object | no | Token bias map |
| `user` | string | no | End-user identifier |
| `suffix` | string | no | Suffix appended after completion |

**Response**:
```json
{
  "id": "cmpl-uqkvlQyYK7bGYrRHQ0eXlWi7",
  "object": "text_completion",
  "created": 1589478378,
  "model": "gpt-3.5-turbo-instruct",
  "choices": [
    {
      "text": "\n\nThis is indeed a test",
      "index": 0,
      "logprobs": null,
      "finish_reason": "length"
    }
  ],
  "usage": {
    "prompt_tokens": 5,
    "completion_tokens": 7,
    "total_tokens": 12
  }
}
```

Streaming uses same SSE format with `data: [DONE]` terminator.

---

### 2.4 Embeddings — `POST /v1/embeddings`

**Request body** (`application/json`):

| Field | Type | Required | Description |
|---|---|---|---|
| `model` | string | yes | `text-embedding-ada-002`, `text-embedding-3-small`, `text-embedding-3-large` |
| `input` | string \| array | yes | Text, array of strings, or array of token arrays (max 2048 items, 300k total tokens) |
| `encoding_format` | string | no | `"float"` (default) or `"base64"` |
| `dimensions` | integer | no | Output dimensions (only `text-embedding-3+`) |
| `user` | string | no | End-user identifier |

**Response**:
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.0023064255, -0.009327292, ...],
      "index": 0
    }
  ],
  "model": "text-embedding-ada-002",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

**No streaming** for embeddings.

---

### 2.5 Models — `GET /v1/models`

No request body. Returns list of available models.

**Response**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1686935002,
      "owned_by": "openai"
    },
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "created": 1686935002,
      "owned_by": "openai"
    }
  ]
}
```

### `GET /v1/models/{model}` — Retrieve single model:
```json
{
  "id": "gpt-4o-mini",
  "object": "model",
  "created": 1686935002,
  "owned_by": "openai"
}
```

---

### 2.6 Other Endpoints to Consider

| Endpoint | Method | Description |
|---|---|---|
| `/v1/moderations` | POST | Content moderation |
| `/v1/audio/speech` | POST | TTS (binary response or SSE) |
| `/v1/audio/transcriptions` | POST | Speech-to-text (multipart) |
| `/v1/audio/translations` | POST | Audio translation |
| `/v1/images/generations` | POST | Image generation |
| `/v1/images/edits` | POST | Image editing |
| `/v1/files` | GET/POST | File management |
| `/v1/fine_tuning/jobs` | POST | Fine-tuning |
| `/v1/batches` | POST | Batch API |
| `/v1/responses` | POST | New Responses API |

---

## 3. HTTP Headers

### Request Headers (to forward/modify):

```
Authorization: Bearer sk-...                          # Authentication
Content-Type: application/json                        # Required for POST
OpenAI-Organization: org-xxx                          # Optional org header
OpenAI-Project: proj-xxx                              # Optional project header
OpenAI-Beta: assistants=v2                            # Beta features
X-Request-Id: req_xxx                                 # Request tracking
OpenAI-Debug-Force-Trace: true                        # Debug tracing
```

### Response Headers (to forward):

```
Content-Type: application/json                        # Non-streaming
Content-Type: text/event-stream                       # Streaming
X-Request-Id: req_xxx                                 # Request tracking
OpenAI-Organization: org-xxx                          # Org used
OpenAI-Processing-Ms: 123                             # Processing time
OpenAI-Version: 2020-10-01                            # API version
Strict-Transport-Security: max-age=...                # Security
```

---

## 4. Streaming Proxy Implementation Details

### 4.1 SSE Wire Protocol

Each SSE event has this format over the wire:
```
data: {"id":"chatcmpl-abc","object":"chat.completion.chunk",...}\n\n
data: {"id":"chatcmpl-abc","object":"chat.completion.chunk",...}\n\n
data: [DONE]\n\n
```

Key rules:
- Each event is `data: <json>\n\n` (note the double newline)
- The `[DONE]` signal is NOT JSON — must handle as special case
- Events can be fragmented across TCP chunks — must buffer
- Multiple events can arrive in a single TCP chunk — must split on `\n\n`

### 4.2 Non-Streaming Response Handling

For non-streaming responses:
- Read the full response body
- Parse as JSON
- Modify as needed (add fields, filter content, etc.)
- Set correct `Content-Length` header
- Forward to client

### 4.3 Streaming Response Interception

**Option A: Transform in-flight (low latency)**:
1. Forward upstream response headers immediately with `Transfer-Encoding: chunked`
2. Read SSE lines from upstream as they arrive
3. Parse each `data: {...}` line as JSON
4. Modify the chunk (inject content, filter, augment)
5. Write modified SSE line to downstream
6. On `data: [DONE]`, forward and close

**Option B: Buffer and replay (full control)**:
1. Buffer the entire stream from upstream
2. Collect all chunks into a complete response
3. Modify the aggregated result
4. Either send as non-streaming response or replay as SSE stream

### 4.4 Content-Length vs Transfer-Encoding

- **Non-streaming**: Use `Content-Length` — body size is known
- **Streaming**: Must use `Transfer-Encoding: chunked` — body size is unknown
- **Proxy rule**: When intercepting streaming responses, ALWAYS:
  - Remove `Content-Length` from forwarded headers
  - Add `Transfer-Encoding: chunked`
  - Do NOT buffer the entire stream

### 4.5 Stream Cloning (Node.js / Web Streams)

You cannot read a ReadableStream twice. To inspect stream content while forwarding:

```javascript
// Using TransformStream to tee the stream
const { readable, writable } = new TransformStream();
const [stream1, stream2] = readable.tee();

// Pipe upstream to writable, read from stream1 (forward) and stream2 (inspect)
```

Or use a pass-through Transform:
```javascript
const transform = new TransformStream({
  transform(chunk, controller) {
    // Inspect chunk here
    controller.enqueue(chunk); // Pass through unchanged
  }
});
```

---

## 5. Error Response Format

All errors return JSON:

```json
{
  "error": {
    "message": "Incorrect API key provided: sk-xxxx...xxxx.",
    "type": "invalid_request_error",
    "param": null,
    "code": "invalid_api_key"
  }
}
```

Common HTTP status codes:
- `400` — Bad request (invalid JSON, missing required fields)
- `401` — Invalid authentication
- `403` — Forbidden (organization restrictions)
- `404` — Model not found
- `429` — Rate limit exceeded
- `500` — Internal server error
- `503` — Service overloaded (includes `Retry-After` header)

Error types:
- `invalid_request_error`
- `authentication_error`
- `permission_error`
- `not_found_error`
- `rate_limit_error`
- `api_connection_error`
- `server_error`

---

## 6. Provider Compatibility Matrix

### OpenAI (reference implementation)
- Base URL: `https://api.openai.com/v1`
- Auth: `Authorization: Bearer sk-...`
- Full API support

### Azure OpenAI
- Base URL: `https://{resource}.openai.azure.com/openai/`
- Auth: `api-key: ...` header (NOT Bearer token)
- Also supports Microsoft Entra (Bearer token)
- Path differences: `/deployments/{deployment-id}/chat/completions?api-version=2024-xx-xx`
- Requires `api-version` query parameter
- Model names are "deployment names" — different from OpenAI model IDs
- Embeddings: `/deployments/{id}/embeddings?api-version=...`
- No `/models` endpoint in same format

### Anthropic (via adapter required)
- Native API is completely different from OpenAI format
- Uses `/v1/messages` endpoint with different schema
- Requires adapter/translator:
  - Request: Convert `messages[]` to Anthropic format (separate `system` param, `messages` only user/assistant)
  - Response: Convert from `content[0].text` to `choices[0].message.content`
  - Streaming: Anthropic uses SSE events like `message_start`, `content_block_delta`, `message_delta` with different schemas
- Headers: `x-api-key: ...`, `anthropic-version: 2023-06-01`
- Tools like LiteLLM, OpenRouter provide this translation layer

### Google Gemini (via adapter required)
- Native API uses completely different format
- OpenAI compatibility available via:
  - Google's own OpenAI-compatible endpoint
  - LiteLLM / OpenRouter adapters

### Groq
- Base URL: `https://api.groq.com/openai/v1`
- Auth: `Authorization: Bearer gsk_...`
- **Fully OpenAI-compatible** — drop-in replacement
- Supports: chat completions, streaming, tool calling
- Adds extra fields like `x_groq` in response for usage details
- Much faster inference (LPU hardware)

### Together AI
- Base URL: `https://api.together.xyz/v1`
- Auth: `Authorization: Bearer ...`
- **Fully OpenAI-compatible**
- Supports chat completions, completions, embeddings, images

### Fireworks AI
- Base URL: `https://api.fireworks.ai/inference/v1`
- Auth: `Authorization: Bearer ...`
- **Fully OpenAI-compatible**

### Mistral (via La Plateforme)
- Base URL: `https://api.mistral.ai/v1`
- Auth: `Authorization: Bearer ...`
- **OpenAI-compatible** for chat completions and embeddings
- Has own native API too

### Cohere
- Has OpenAI-compatible endpoint available
- Native API format is different
- Use `/v1/chat/completions` compatible endpoint

### Ollama (local)
- Base URL: `http://localhost:11434/v1`
- Auth: None required
- **Fully OpenAI-compatible** (since v0.1.14)
- Supports chat completions, completions, embeddings
- Auto-loads models on first request

### vLLM (local)
- Base URL: `http://localhost:8000/v1`
- Auth: Optional (via `--api-key` flag)
- **Fully OpenAI-compatible**
- Supports chat completions, completions, embeddings
- Supports continuous batching

### LM Studio (local)
- Base URL: `http://localhost:1234/v1`
- **Fully OpenAI-compatible**

### OpenRouter
- Base URL: `https://openrouter.ai/api/v1`
- Auth: `Authorization: Bearer ...`
- **OpenAI-compatible** unified gateway to many providers
- Adds `provider` field in response for routing metadata
- Supports model routing with `model: "openai/gpt-4o"` or `"anthropic/claude-3.5-sonnet"`

### Key Compatibility Differences to Handle:

| Feature | OpenAI | Azure | Anthropic (adapter) | Ollama/vLLM |
|---|---|---|---|---|
| Auth header | `Authorization: Bearer` | `api-key:` | `x-api-key:` | None |
| Path prefix | `/v1/` | `/openai/deployments/{id}/` | `/v1/messages` | `/v1/` |
| Model param | `gpt-4o` | deployment name | `claude-3-5-sonnet-20241022` | `llama3` |
| `stream_options` | Supported | Partial | N/A | Partial |
| Tool calling | Full | Full | Different format | Partial |
| `system_fingerprint` | Yes | Yes | No | No |
| Rate limits headers | Yes | Yes | Yes | No |

---

## 7. Proxy Architecture Recommendations

### Request Flow:
```
Client → Proxy → [Request Interceptor] → Provider → [Response Interceptor] → Client
```

### Key intercept points:

1. **Request interceptor** (before forwarding to provider):
   - Map model name (e.g., `gpt-4` → provider-specific deployment/model ID)
   - Inject/override system message
   - Add authentication headers for target provider
   - Validate request body
   - Rate limiting / quota checking
   - Log request metadata

2. **Response interceptor** (after receiving from provider):
   - Normalize response format across providers
   - Inject custom fields (proxy metadata, timing)
   - Content filtering / moderation
   - Usage tracking / cost calculation
   - Error normalization

3. **Streaming interceptor** (for SSE responses):
   - Parse SSE `data:` lines
   - Modify individual chunks in-flight
   - Aggregate usage from final chunk
   - Handle `data: [DONE]` termination
   - Detect and forward mid-stream errors

### Critical implementation notes:

1. **Always check `stream` field** in request body to determine response handling mode
2. **Set appropriate timeouts** — streaming connections can be long-lived (minutes for large outputs)
3. **Handle connection drops** — client may disconnect mid-stream; clean up upstream connections
4. **Don't buffer streaming responses** unless necessary — use TransformStream patterns
5. **Strip hop-by-hop headers** when proxying: `Connection`, `Keep-Alive`, `Transfer-Encoding`, `TE`, `Upgrade`
6. **Forward error responses faithfully** — preserve status codes and error JSON format
7. **Respect `Retry-After`** header from 429/503 responses
