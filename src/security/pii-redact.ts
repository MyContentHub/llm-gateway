import { scanPii } from "./pii-scanner.js";

const PLACEHOLDER_RE = /\[[A-Z][A-Z_]*_\d+\]/g;
const PARTIAL_RE = /\[[A-Z][A-Z_]*(?:_\d*)?$/;

export interface StreamingRestorer {
  push(chunk: string): string;
  flush(): string;
}

export interface PiiContext {
  redact(text: string): { text: string; mapping: Map<string, string> };
  restore(text: string, mapping: Map<string, string>): string;
  createStreamingRestorer(mapping: Map<string, string>): StreamingRestorer;
}

export function createPiiContext(): PiiContext {
  const typeCounters = new Map<string, number>();
  const valueToPlaceholder = new Map<string, string>();

  function nextPlaceholder(type: string): string {
    const count = (typeCounters.get(type) ?? 0) + 1;
    typeCounters.set(type, count);
    return `[${type}_${count}]`;
  }

  function redact(text: string): { text: string; mapping: Map<string, string> } {
    const matches = scanPii(text);
    const mapping = new Map<string, string>();

    if (matches.length === 0) {
      return { text, mapping };
    }

    const placeholders: string[] = [];
    for (let i = 0; i < matches.length; i++) {
      let placeholder = valueToPlaceholder.get(matches[i].value);
      if (!placeholder) {
        placeholder = nextPlaceholder(matches[i].type);
        valueToPlaceholder.set(matches[i].value, placeholder);
      }
      mapping.set(placeholder, matches[i].value);
      placeholders[i] = placeholder;
    }

    let result = text;
    for (let i = matches.length - 1; i >= 0; i--) {
      result =
        result.slice(0, matches[i].start) +
        placeholders[i] +
        result.slice(matches[i].end);
    }

    return { text: result, mapping };
  }

  function restore(text: string, mapping: Map<string, string>): string {
    return text.replace(PLACEHOLDER_RE, (match) => mapping.get(match) ?? match);
  }

  function createStreamingRestorer(mapping: Map<string, string>): StreamingRestorer {
    let buffer = "";

    return {
      push(chunk: string): string {
        const working = buffer + chunk;
        buffer = "";

        const partialMatch = working.match(PARTIAL_RE);
        if (partialMatch && partialMatch.index !== undefined) {
          buffer = working.slice(partialMatch.index);
          const processable = working.slice(0, partialMatch.index);
          return restore(processable, mapping);
        }

        return restore(working, mapping);
      },

      flush(): string {
        const result = restore(buffer, mapping);
        buffer = "";
        return result;
      },
    };
  }

  return { redact, restore, createStreamingRestorer };
}
