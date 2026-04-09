import { describe, it, expect } from "vitest";
import { createSSETransformStream } from "./sse-parser.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function createChunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

describe("createSSETransformStream", () => {
  it("relays normal SSE chunks", async () => {
    const input = createChunkedStream([
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n\n',
    ]);

    const transform = createSSETransformStream();
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toBe(
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}\n\n',
    );
  });

  it("buffers partial lines across TCP packets", async () => {
    const input = createChunkedStream([
      'data: {"id":"chatc',
      'mpl-1","choices":[{"delta":{"content":"Hi"}}]}\n\n',
    ]);

    const transform = createSSETransformStream();
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toBe(
      'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hi"}}]}\n\n',
    );
  });

  it("handles data: [DONE] and forwards it", async () => {
    const input = createChunkedStream([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const transform = createSSETransformStream();
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toContain("data: [DONE]\n\n");
    expect(result).toContain('"content":"Hi"');
  });

  it("handles [DONE] split across packets", async () => {
    const input = createChunkedStream(["data: [DON", "E]\n\n"]);

    const transform = createSSETransformStream();
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toBe("data: [DONE]\n\n");
  });

  it("relays mid-stream error events as-is", async () => {
    const input = createChunkedStream([
      'data: {"error":{"message":"Rate limited","type":"rate_limit_error","code":"rate_limit_exceeded"}}\n\n',
    ]);

    const transform = createSSETransformStream();
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toContain('"error"');
    expect(result).toContain('"rate_limit_exceeded"');
  });

  it("handles multiple events in a single chunk", async () => {
    const input = createChunkedStream([
      'data: {"delta":{"content":"A"}}\n\ndata: {"delta":{"content":"B"}}\n\n',
    ]);

    const transform = createSSETransformStream();
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toContain('"content":"A"');
    expect(result).toContain('"content":"B"');
  });

  it("applies onChunk transform hook", async () => {
    const input = createChunkedStream([
      'data: {"choices":[{"delta":{"content":"secret123"}}]}\n\n',
    ]);

    const transform = createSSETransformStream({
      onChunk: (data) => data.replace(/secret\d+/, "[REDACTED]"),
    });
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("secret123");
  });

  it("does not apply onChunk to [DONE]", async () => {
    const input = createChunkedStream(["data: [DONE]\n\n"]);

    const transform = createSSETransformStream({
      onChunk: () => "OVERRIDDEN",
    });
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toBe("data: [DONE]\n\n");
  });

  it("handles full OpenAI streaming lifecycle", async () => {
    const input = createChunkedStream([
      'data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1234,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ]);

    const transform = createSSETransformStream();
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    const events = result.split("\n\n").filter((e) => e.length > 0);
    expect(events).toHaveLength(5);
    expect(events[0]).toContain('"role":"assistant"');
    expect(events[1]).toContain('"content":"Hello"');
    expect(events[2]).toContain('"content":"!"');
    expect(events[3]).toContain('"finish_reason":"stop"');
    expect(events[4]).toBe("data: [DONE]");
  });

  it("handles partial buffering at stream close via flush", async () => {
    const input = createChunkedStream([
      'data: {"chunk":"value"}\n',
      "\n",
    ]);

    const transform = createSSETransformStream();
    const output = input.pipeThrough(transform);
    const result = await readStream(output);

    expect(result).toContain('"chunk":"value"');
  });
});
