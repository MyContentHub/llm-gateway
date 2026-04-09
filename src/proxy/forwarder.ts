export interface ForwardRequest {
  upstreamUrl: string;
  apiKey: string;
  body: unknown;
}

export interface ForwardResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

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

  return {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": upstreamResponse.headers.get("x-request-id") ?? "",
      "X-Response-Time": `${elapsed}ms`,
    },
    body: responseBody,
  };
}
