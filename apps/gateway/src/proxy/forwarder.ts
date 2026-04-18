import { createSSETransformStream } from "./sse-parser.js";
import type { SSETransformOptions } from "./sse-parser.js";
import {
  retryWithBackoff,
  isRetryable,
  sleep,
  DEFAULT_RETRY_CONFIG,
} from "./retry.js";
import type { RetryConfig } from "./retry.js";

export interface ForwardRequest {
  upstreamUrl: string;
  apiKey: string;
  body: unknown;
  retryConfig?: RetryConfig;
}

export interface StreamForwardRequest extends ForwardRequest {
  sseOptions?: SSETransformOptions;
  retryConfig?: RetryConfig;
}

export interface ForwardResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface StreamForwardSuccess {
  ok: true;
  status: number;
  headers: Record<string, string>;
  stream: ReadableStream<Uint8Array>;
}

export interface StreamForwardError {
  ok: false;
  status: number;
  body: unknown;
}

export type StreamForwardResponse = StreamForwardSuccess | StreamForwardError;

export interface UpstreamError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

function formatUpstreamError(status: number, body: unknown): UpstreamError {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "object" &&
    (body as { error: unknown }).error !== null
  ) {
    return body as UpstreamError;
  }

  const message = typeof body === "string" ? body : JSON.stringify(body);

  return {
    error: {
      message,
      type: "upstream_error",
      code: `upstream_${status}`,
    },
  };
}

export async function forwardRequest(request: ForwardRequest): Promise<ForwardResponse> {
  const retryConfig = request.retryConfig ?? DEFAULT_RETRY_CONFIG;

  const result = await retryWithBackoff(
    async () => {
      const startTime = Date.now();

      let upstreamResponse: Response;
      try {
        upstreamResponse = await fetch(request.upstreamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${request.apiKey}`,
          },
          body: JSON.stringify(request.body),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown upstream error";
        return {
          status: 502,
          headers: { "Content-Type": "application/json" },
          body: {
            error: {
              message,
              type: "upstream_connection_error",
              code: "upstream_unreachable",
            },
          },
        };
      }

      const elapsed = Date.now() - startTime;
      const contentType = upstreamResponse.headers.get("content-type") ?? "application/json";

      let responseBody: unknown;
      const rawText = await upstreamResponse.text();
      if (contentType.includes("application/json")) {
        try {
          responseBody = JSON.parse(rawText);
        } catch {
          responseBody = rawText;
        }
      } else {
        responseBody = rawText;
      }

      if (!upstreamResponse.ok) {
        return {
          status: upstreamResponse.status,
          headers: { "Content-Type": "application/json" },
          body: formatUpstreamError(upstreamResponse.status, responseBody),
        };
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const requestId = upstreamResponse.headers.get("x-request-id");
      if (requestId) headers["X-Request-Id"] = requestId;
      headers["X-Response-Time"] = `${elapsed}ms`;

      return {
        status: upstreamResponse.status,
        headers,
        body: responseBody,
      };
    },
    (res) => isRetryable(res.status),
    retryConfig,
  );

  return result;
}

export async function forwardStreamRequest(
  request: StreamForwardRequest,
): Promise<StreamForwardResponse> {
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(request.upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify(request.body),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown upstream error";
    return {
      ok: false,
      status: 502,
      body: {
        error: {
          message,
          type: "upstream_connection_error",
          code: "upstream_unreachable",
        },
      },
    };
  }

  if (!upstreamResponse.ok) {
    const rawText = await upstreamResponse.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(rawText);
    } catch {
      responseBody = rawText;
    }
    return {
      ok: false,
      status: upstreamResponse.status,
      body: formatUpstreamError(upstreamResponse.status, responseBody),
    };
  }

  const body = upstreamResponse.body;
  if (!body) {
    return {
      ok: false,
      status: 502,
      body: {
        error: {
          message: "Upstream returned empty body for streaming request",
          type: "upstream_error",
          code: "upstream_empty_body",
        },
      },
    };
  }

  const sseTransform = createSSETransformStream(request.sseOptions);
  const transformedStream = body.pipeThrough(sseTransform);

  return {
    ok: true,
    status: upstreamResponse.status,
    headers: {
      "X-Request-Id": upstreamResponse.headers.get("x-request-id") ?? "",
    },
    stream: transformedStream,
  };
}
