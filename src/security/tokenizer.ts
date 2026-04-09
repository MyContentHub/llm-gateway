import { getEncoding, encodingForModel } from "js-tiktoken";
import type { TiktokenEncoding, TiktokenModel } from "js-tiktoken";

const CL100K_MODELS = new Set<string>([
  "gpt-4",
  "gpt-4-turbo",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "text-embedding-ada-002",
  "text-embedding-3-small",
  "text-embedding-3-large",
]);

const O200K_MODELS = new Set<string>([
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-11-20",
  "gpt-4o-mini-2024-07-18",
  "chatgpt-4o-latest",
]);

function resolveEncoding(model: string): TiktokenEncoding | null {
  if (O200K_MODELS.has(model)) return "o200k_base";
  if (CL100K_MODELS.has(model)) return "cl100k_base";
  if (model.startsWith("gpt-4o") || model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4")) return "o200k_base";
  if (model.startsWith("gpt-4") || model.startsWith("gpt-3.5")) return "cl100k_base";
  if (model.startsWith("text-embedding-")) return "cl100k_base";
  try {
    const enc = encodingForModel(model as TiktokenModel);
    return enc as unknown as TiktokenEncoding;
  } catch {
    return null;
  }
}

export function countTokens(text: string, model?: string): number {
  if (!text) return 0;

  if (!model) {
    const enc = getEncoding("cl100k_base");
    return enc.encode(text).length;
  }

  const encoding = resolveEncoding(model);
  if (!encoding) {
    return Math.ceil(text.length / 4);
  }

  try {
    const enc = getEncoding(encoding);
    return enc.encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

export function countChatTokens(messages: { content: string }[], model?: string): number {
  if (!messages || messages.length === 0) return 0;

  let total = 0;
  for (const msg of messages) {
    total += countTokens(msg.content, model);
    total += 4;
  }
  total += 2;

  return total;
}
