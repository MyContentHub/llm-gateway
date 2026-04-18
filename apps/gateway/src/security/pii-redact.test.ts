import { describe, it, expect } from "vitest";
import { createPiiContext } from "./pii-redact.js";

describe("createPiiContext", () => {
  describe("redact", () => {
    it("redacts SSN and EMAIL with typed placeholders", () => {
      const ctx = createPiiContext();
      const input = "My SSN is 123-45-6789 and email is test@example.com";
      const { text, mapping } = ctx.redact(input);

      expect(text).toBe("My SSN is [SSN_1] and email is [EMAIL_1]");
      expect(mapping.get("[SSN_1]")).toBe("123-45-6789");
      expect(mapping.get("[EMAIL_1]")).toBe("test@example.com");
    });

    it("returns original text and empty mapping when no PII found", () => {
      const ctx = createPiiContext();
      const { text, mapping } = ctx.redact("Hello world, no secrets here");

      expect(text).toBe("Hello world, no secrets here");
      expect(mapping.size).toBe(0);
    });

    it("handles empty string", () => {
      const ctx = createPiiContext();
      const { text, mapping } = ctx.redact("");

      expect(text).toBe("");
      expect(mapping.size).toBe(0);
    });

    it("assigns unique indices for multiple PII of the same type", () => {
      const ctx = createPiiContext();
      const { text, mapping } = ctx.redact("Emails: a@b.com and c@d.com");

      expect(text).toBe("Emails: [EMAIL_1] and [EMAIL_2]");
      expect(mapping.get("[EMAIL_1]")).toBe("a@b.com");
      expect(mapping.get("[EMAIL_2]")).toBe("c@d.com");
    });

    it("deduplicates same value to same placeholder within one call", () => {
      const ctx = createPiiContext();
      const input = "SSN: 123-45-6789 and again 123-45-6789";
      const { text, mapping } = ctx.redact(input);

      expect(text).toBe("SSN: [SSN_1] and again [SSN_1]");
      expect(mapping.size).toBe(1);
      expect(mapping.get("[SSN_1]")).toBe("123-45-6789");
    });

    it("deduplicates across multiple redact calls in same context", () => {
      const ctx = createPiiContext();
      const r1 = ctx.redact("SSN: 123-45-6789");
      const r2 = ctx.redact("Also SSN: 123-45-6789 here");

      expect(r1.text).toBe("SSN: [SSN_1]");
      expect(r2.text).toBe("Also SSN: [SSN_1] here");
      expect(r2.mapping.get("[SSN_1]")).toBe("123-45-6789");
    });

    it("increments counter for new values of same type", () => {
      const ctx = createPiiContext();
      const r1 = ctx.redact("Email: a@b.com");
      const r2 = ctx.redact("Email: x@y.com");

      expect(r1.text).toBe("Email: [EMAIL_1]");
      expect(r2.text).toBe("Email: [EMAIL_2]");
    });
  });

  describe("restore", () => {
    it("restores placeholders to original values", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
        ["[EMAIL_1]", "test@example.com"],
      ]);

      const result = ctx.restore("Noted your [SSN_1] and [EMAIL_1]", mapping);
      expect(result).toBe("Noted your 123-45-6789 and test@example.com");
    });

    it("leaves unknown placeholders as-is", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
      ]);

      const result = ctx.restore("Noted [SSN_1] and [UNKNOWN_1]", mapping);
      expect(result).toBe("Noted 123-45-6789 and [UNKNOWN_1]");
    });

    it("handles text with no placeholders", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>();

      const result = ctx.restore("No placeholders here", mapping);
      expect(result).toBe("No placeholders here");
    });

    it("restores same placeholder multiple times", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
      ]);

      const result = ctx.restore("[SSN_1] and [SSN_1]", mapping);
      expect(result).toBe("123-45-6789 and 123-45-6789");
    });

    it("handles empty mapping with placeholders in text", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>();

      const result = ctx.restore("Data: [SSN_1]", mapping);
      expect(result).toBe("Data: [SSN_1]");
    });
  });

  describe("redact then restore round-trip", () => {
    it("round-trips SSN and EMAIL correctly", () => {
      const ctx = createPiiContext();
      const input = "My SSN is 123-45-6789 and email is test@example.com";
      const { text: redacted, mapping } = ctx.redact(input);
      const restored = ctx.restore(`LLM saw: ${redacted}`, mapping);

      expect(restored).toBe(
        "LLM saw: My SSN is 123-45-6789 and email is test@example.com",
      );
    });

    it("round-trips with deduplication", () => {
      const ctx = createPiiContext();
      const input = "SSN: 123-45-6789 again 123-45-6789";
      const { text: redacted, mapping } = ctx.redact(input);
      const restored = ctx.restore(`Echo: ${redacted}`, mapping);

      expect(restored).toBe("Echo: SSN: 123-45-6789 again 123-45-6789");
    });
  });

  describe("createStreamingRestorer", () => {
    it("restores complete placeholder in single chunk", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
      ]);
      const restorer = ctx.createStreamingRestorer(mapping);

      expect(restorer.push("SSN is [SSN_1] ok")).toBe("SSN is 123-45-6789 ok");
    });

    it("buffers partial placeholder across chunks", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
      ]);
      const restorer = ctx.createStreamingRestorer(mapping);

      expect(restorer.push("SSN is [SSN")).toBe("SSN is ");
      expect(restorer.push("_1] done")).toBe("123-45-6789 done");
    });

    it("handles multiple placeholders split across chunks", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
        ["[EMAIL_1]", "test@example.com"],
      ]);
      const restorer = ctx.createStreamingRestorer(mapping);

      expect(restorer.push("Data: [SSN_1] and [EMA")).toBe(
        "Data: 123-45-6789 and ",
      );
      expect(restorer.push("IL_1] here")).toBe("test@example.com here");
    });

    it("flushes remaining buffer", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
      ]);
      const restorer = ctx.createStreamingRestorer(mapping);

      restorer.push("SSN: [SSN");
      expect(restorer.flush()).toBe("[SSN");
    });

    it("flush returns incomplete placeholder as-is", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
      ]);
      const restorer = ctx.createStreamingRestorer(mapping);

      restorer.push("SSN: [SSN_1");
      expect(restorer.flush()).toBe("[SSN_1");
    });

    it("flush restores complete placeholder from buffer", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
      ]);
      const restorer = ctx.createStreamingRestorer(mapping);

      restorer.push("SSN: [SSN");
      restorer.push("_1]");
      expect(restorer.flush()).toBe("");
    });

    it("handles empty chunks", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>();
      const restorer = ctx.createStreamingRestorer(mapping);

      expect(restorer.push("")).toBe("");
      expect(restorer.flush()).toBe("");
    });

    it("handles text without placeholders", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>();
      const restorer = ctx.createStreamingRestorer(mapping);

      expect(restorer.push("Hello world")).toBe("Hello world");
    });

    it("handles bracket that is not a placeholder start", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>();
      const restorer = ctx.createStreamingRestorer(mapping);

      expect(restorer.push("Array[0] value")).toBe("Array[0] value");
    });

    it("accumulates full stream and matches non-streaming restore", () => {
      const ctx = createPiiContext();
      const mapping = new Map<string, string>([
        ["[SSN_1]", "123-45-6789"],
        ["[EMAIL_1]", "test@example.com"],
      ]);
      const restorer = ctx.createStreamingRestorer(mapping);

      const chunks = [
        "User [SSN_1",
        "] has email [EMA",
        "IL_1]",
      ];
      let accumulated = "";
      for (const chunk of chunks) {
        accumulated += restorer.push(chunk);
      }
      accumulated += restorer.flush();

      const expected = ctx.restore(
        "User [SSN_1] has email [EMAIL_1]",
        mapping,
      );
      expect(accumulated).toBe(expected);
    });
  });

  describe("per-request isolation", () => {
    it("different contexts have independent counters", () => {
      const ctx1 = createPiiContext();
      const ctx2 = createPiiContext();

      const r1 = ctx1.redact("Email: a@b.com");
      const r2 = ctx2.redact("Email: x@y.com");

      expect(r1.text).toBe("Email: [EMAIL_1]");
      expect(r2.text).toBe("Email: [EMAIL_1]");
    });

    it("different contexts do not share dedup state", () => {
      const ctx1 = createPiiContext();
      const ctx2 = createPiiContext();

      ctx1.redact("Email: a@b.com");
      const r2 = ctx2.redact("Email: a@b.com");

      expect(r2.mapping.get("[EMAIL_1]")).toBe("a@b.com");
    });
  });
});
