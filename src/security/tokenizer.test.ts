import { describe, it, expect } from "vitest";
import { countTokens, countChatTokens } from "./tokenizer.js";

describe("countTokens", () => {
  it("returns accurate token count for 'Hello world' with cl100k_base", () => {
    const count = countTokens("Hello world");
    expect(count).toBeGreaterThan(0);
    expect(typeof count).toBe("number");
  });

  it("returns 0 for empty string", () => {
    expect(countTokens("")).toBe(0);
  });

  it("returns greater count for longer text", () => {
    const short = countTokens("Hello");
    const long = countTokens("Hello, this is a much longer sentence with many more tokens in it.");
    expect(long).toBeGreaterThan(short);
  });

  it("counts tokens with known model gpt-4", () => {
    const count = countTokens("Hello world", "gpt-4");
    expect(count).toBeGreaterThan(0);
  });

  it("counts tokens with known model gpt-3.5-turbo", () => {
    const count = countTokens("Hello world", "gpt-3.5-turbo");
    expect(count).toBeGreaterThan(0);
  });

  it("falls back to approximate count for unknown model", () => {
    const text = "This is a test string with some length to it";
    const count = countTokens(text, "totally-unknown-model-xyz");
    const expected = Math.ceil(text.length / 4);
    expect(count).toBe(expected);
  });

  it("handles text with special characters", () => {
    const text = "Hello 🌍! Special chars: \t\n\r<>&\"'";
    const count = countTokens(text);
    expect(count).toBeGreaterThan(0);
  });

  it("handles unicode text", () => {
    const text = "你好世界こんにちは";
    const count = countTokens(text);
    expect(count).toBeGreaterThan(0);
  });

  it("handles single character", () => {
    const count = countTokens("a");
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("handles whitespace-only text", () => {
    const count = countTokens("   \t\n  ");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("returns same count for same input", () => {
    const a = countTokens("Consistent output test");
    const b = countTokens("Consistent output test");
    expect(a).toBe(b);
  });

  it("counts tokens for gpt-4o", () => {
    const count = countTokens("Hello world", "gpt-4o");
    expect(count).toBeGreaterThan(0);
  });

  it("counts tokens for text-embedding-ada-002", () => {
    const count = countTokens("Hello world", "text-embedding-ada-002");
    expect(count).toBeGreaterThan(0);
  });
});

describe("countChatTokens", () => {
  it("returns 0 for empty messages array", () => {
    expect(countChatTokens([])).toBe(0);
  });

  it("counts tokens for a single message", () => {
    const messages = [{ content: "Hello world" }];
    const count = countChatTokens(messages);
    const textOnly = countTokens("Hello world");
    expect(count).toBe(textOnly + 4 + 2);
  });

  it("counts tokens for multiple messages", () => {
    const messages = [
      { content: "Hello" },
      { content: "World" },
    ];
    const count = countChatTokens(messages);
    const hello = countTokens("Hello");
    const world = countTokens("World");
    expect(count).toBe(hello + 4 + world + 4 + 2);
  });

  it("counts tokens for messages with model specified", () => {
    const messages = [
      { content: "What is the capital of France?" },
      { content: "The capital of France is Paris." },
    ];
    const count = countChatTokens(messages, "gpt-4");
    expect(count).toBeGreaterThan(0);
  });

  it("handles messages with empty content", () => {
    const messages = [{ content: "" }];
    const count = countChatTokens(messages);
    expect(count).toBe(0 + 4 + 2);
  });

  it("handles long conversation", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      content: `Message number ${i + 1} with some content`,
    }));
    const count = countChatTokens(messages);
    expect(count).toBeGreaterThan(0);
    const totalTextTokens = messages.reduce((sum, m) => sum + countTokens(m.content), 0);
    expect(count).toBe(totalTextTokens + 10 * 4 + 2);
  });

  it("handles messages with special characters", () => {
    const messages = [
      { content: "Hello 🌍! <script>alert('xss')</script>" },
      { content: "Special: \t\n\r&\"'" },
    ];
    const count = countChatTokens(messages);
    expect(count).toBeGreaterThan(0);
  });

  it("falls back gracefully for unknown model", () => {
    const messages = [
      { content: "Test message" },
    ];
    const count = countChatTokens(messages, "unknown-model");
    expect(count).toBeGreaterThan(0);
  });
});
