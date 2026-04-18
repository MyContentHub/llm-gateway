const contentPartTextSchema = {
  type: "object",
  properties: {
    type: { type: "string", const: "text" },
    text: { type: "string" },
  },
  required: ["type", "text"],
};

const contentPartImageUrlSchema = {
  type: "object",
  properties: {
    type: { type: "string", const: "image_url" },
    image_url: {
      type: "object",
      properties: {
        url: { type: "string" },
        detail: { type: "string", enum: ["auto", "low", "high"] },
      },
      required: ["url"],
    },
  },
  required: ["type", "image_url"],
};

const contentPartInputAudioSchema = {
  type: "object",
  properties: {
    type: { type: "string", const: "input_audio" },
    input_audio: {
      type: "object",
      properties: {
        data: { type: "string" },
        format: { type: "string", enum: ["wav", "mp3"] },
      },
      required: ["data", "format"],
    },
  },
  required: ["type", "input_audio"],
};

const userContentSchema = {
  oneOf: [
    { type: "string" },
    {
      type: "array",
      items: {
        oneOf: [contentPartTextSchema, contentPartImageUrlSchema, contentPartInputAudioSchema],
      },
    },
  ],
};

const systemMessageSchema = {
  type: "object",
  properties: {
    role: { type: "string", const: "system" },
    content: { type: "string" },
    name: { type: "string" },
  },
  required: ["role", "content"],
};

const developerMessageSchema = {
  type: "object",
  properties: {
    role: { type: "string", const: "developer" },
    content: { type: "string" },
    name: { type: "string" },
  },
  required: ["role", "content"],
};

const userMessageSchema = {
  type: "object",
  properties: {
    role: { type: "string", const: "user" },
    content: userContentSchema,
    name: { type: "string" },
  },
  required: ["role", "content"],
};

const functionObjectSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    arguments: { type: "string" },
  },
  required: ["name", "arguments"],
};

const toolCallSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    type: { type: "string", const: "function" },
    function: functionObjectSchema,
  },
  required: ["id", "type", "function"],
};

const assistantMessageSchema = {
  type: "object",
  properties: {
    role: { type: "string", const: "assistant" },
    content: { type: ["string", "null"] },
    name: { type: "string" },
    tool_calls: { type: "array", items: toolCallSchema },
    refusal: { type: ["string", "null"] },
  },
  required: ["role"],
};

const toolMessageSchema = {
  type: "object",
  properties: {
    role: { type: "string", const: "tool" },
    content: { type: ["string", "null"] },
    tool_call_id: { type: "string" },
  },
  required: ["role", "content", "tool_call_id"],
};

const messageSchema = {
  oneOf: [
    systemMessageSchema,
    developerMessageSchema,
    userMessageSchema,
    assistantMessageSchema,
    toolMessageSchema,
  ],
};

const functionDefinitionSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    parameters: { type: "object" },
    strict: { type: "boolean" },
  },
  required: ["name"],
};

const toolSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["function"] },
    function: functionDefinitionSchema,
  },
  required: ["type", "function"],
};

const responseFormatJsonSchema = {
  type: "object",
  properties: {
    type: { type: "string", const: "json_schema" },
    json_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        schema: { type: "object" },
        strict: { type: "boolean" },
      },
      required: ["name", "schema"],
    },
  },
  required: ["type", "json_schema"],
};

const responseFormatSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["text", "json_object"] },
      },
      required: ["type"],
    },
    responseFormatJsonSchema,
  ],
};

const streamOptionsSchema = {
  type: "object",
  properties: {
    include_usage: { type: "boolean" },
  },
  required: ["include_usage"],
};

const audioSchema = {
  type: "object",
  properties: {
    voice: { type: "string", enum: ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"] },
    format: { type: "string", enum: ["wav", "mp3", "flac", "opus", "pcm16"] },
  },
  required: ["voice", "format"],
};

const ChatCompletionRequestSchema = {
  type: "object",
  properties: {
    model: { type: "string" },
    messages: {
      type: "array",
      items: messageSchema,
      minItems: 1,
    },
    stream: { type: "boolean", default: false },
    stream_options: streamOptionsSchema,
    temperature: { type: "number", minimum: 0, maximum: 2 },
    top_p: { type: "number", minimum: 0, maximum: 1 },
    n: { type: "integer", minimum: 1, maximum: 128, default: 1 },
    max_tokens: { type: "integer" },
    max_completion_tokens: { type: "integer" },
    stop: {
      oneOf: [
        { type: "string" },
        { type: "array", items: { type: "string" }, maxItems: 4 },
      ],
    },
    presence_penalty: { type: "number", minimum: -2, maximum: 2, default: 0 },
    frequency_penalty: { type: "number", minimum: -2, maximum: 2, default: 0 },
    logit_bias: {
      type: "object",
      additionalProperties: { type: "integer", minimum: -100, maximum: 100 },
    },
    logprobs: { type: "boolean", default: false },
    top_logprobs: { type: "integer", minimum: 0, maximum: 20 },
    response_format: responseFormatSchema,
    seed: { type: "integer" },
    tools: { type: "array", items: toolSchema },
    tool_choice: {
      oneOf: [
        { type: "string", enum: ["none", "auto", "required"] },
        {
          type: "object",
          properties: {
            type: { type: "string", const: "function" },
            function: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
          },
          required: ["type", "function"],
        },
      ],
    },
    parallel_tool_calls: { type: "boolean", default: true },
    store: { type: "boolean", default: false },
    modalities: {
      type: "array",
      items: { type: "string", enum: ["text", "audio"] },
    },
    audio: audioSchema,
    reasoning_effort: { type: "string", enum: ["low", "medium", "high"] },
    prediction: { type: "object" },
    web_search_options: { type: "object" },
    user: { type: "string" },
    metadata: { type: "object" },
    service_tier: { type: "string", enum: ["auto", "default"] },
  },
  required: ["model", "messages"],
};

const logprobsTokenSchema = {
  type: "object",
  properties: {
    token: { type: "string" },
    logprob: { type: "number" },
    bytes: {
      type: "array",
      items: { type: "integer" },
    },
    top_logprobs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          token: { type: "string" },
          logprob: { type: "number" },
          bytes: { type: "array", items: { type: "integer" } },
        },
        required: ["token", "logprob"],
      },
    },
  },
  required: ["token", "logprob", "top_logprobs"],
};

const logprobsContentSchema = {
  type: "object",
  properties: {
    tokens: {
      type: "array",
      items: { type: "string" },
    },
    token_logprobs: {
      type: "array",
      items: { type: ["number", "null"] },
    },
    top_logprobs: {
      type: "array",
      items: {
        type: "array",
        items: logprobsTokenSchema,
      },
    },
    text_offset: {
      type: "array",
      items: { type: "integer" },
    },
  },
  required: ["tokens", "token_logprobs", "top_logprobs", "text_offset"],
};

const completionMessageSchema = {
  type: "object",
  properties: {
    role: { type: "string", const: "assistant" },
    content: { type: ["string", "null"] },
    tool_calls: { type: "array", items: toolCallSchema },
    refusal: { type: ["string", "null"] },
    annotations: { type: "array", items: { type: "object" } },
  },
  required: ["role"],
};

const choiceSchema = {
  type: "object",
  properties: {
    index: { type: "integer" },
    message: completionMessageSchema,
    logprobs: {
      oneOf: [
        { type: "null" },
        {
          type: "object",
          properties: {
            content: {
              oneOf: [{ type: "null" }, logprobsContentSchema],
            },
          },
          required: ["content"],
        },
      ],
    },
    finish_reason: {
      type: "string",
      enum: ["stop", "length", "tool_calls", "content_filter", "function_call"],
    },
  },
  required: ["index", "message", "logprobs", "finish_reason"],
};

const usageSchema = {
  type: "object",
  properties: {
    prompt_tokens: { type: "integer" },
    completion_tokens: { type: "integer" },
    total_tokens: { type: "integer" },
    prompt_tokens_details: {
      type: "object",
      properties: {
        cached_tokens: { type: "integer" },
        audio_tokens: { type: "integer" },
      },
    },
    completion_tokens_details: {
      type: "object",
      properties: {
        reasoning_tokens: { type: "integer" },
        audio_tokens: { type: "integer" },
        accepted_prediction_tokens: { type: "integer" },
        rejected_prediction_tokens: { type: "integer" },
      },
    },
  },
  required: ["prompt_tokens", "completion_tokens", "total_tokens"],
};

const ChatCompletionResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    object: { type: "string", const: "chat.completion" },
    created: { type: "integer" },
    model: { type: "string" },
    choices: {
      type: "array",
      items: choiceSchema,
    },
    usage: usageSchema,
    service_tier: { type: "string" },
    system_fingerprint: { type: "string" },
  },
  required: ["id", "object", "created", "model", "choices"],
};

export {
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  messageSchema,
  toolCallSchema,
  toolSchema,
  choiceSchema,
  usageSchema,
  logprobsContentSchema,
};
