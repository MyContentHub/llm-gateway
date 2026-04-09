import { createParser } from "eventsource-parser";
import type { EventSourceMessage } from "eventsource-parser";

export type SSETransformHook = (data: string) => string;

export interface SSETransformOptions {
  onChunk?: SSETransformHook;
}

export function createSSETransformStream(options?: SSETransformOptions): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const onChunk = options?.onChunk;

  let controllerRef: TransformStreamDefaultController<Uint8Array> | null = null;

  const parser = createParser({
    onEvent(event: EventSourceMessage) {
      if (!controllerRef) return;

      if (event.data === "[DONE]") {
        controllerRef.enqueue(encoder.encode("data: [DONE]\n\n"));
        return;
      }

      const transformedData = onChunk ? onChunk(event.data) : event.data;
      controllerRef.enqueue(encoder.encode(`data: ${transformedData}\n\n`));
    },
  });

  return new TransformStream({
    transform(chunk, controller) {
      controllerRef = controller;
      const text = decoder.decode(chunk, { stream: true });
      parser.feed(text);
    },
    flush() {
      parser.reset({ consume: true });
      controllerRef = null;
    },
  });
}
