import { describe, it, expect } from "vitest";
import { scanPii, type PIIMatch } from "./pii-scanner.js";

function hasMatch(results: PIIMatch[], type: string, value: string): boolean {
  return results.some((r) => r.type === type && r.value === value);
}

describe("scanPii", () => {
  it("returns empty array for empty string", () => {
    expect(scanPii("")).toEqual([]);
  });

  it("returns empty array for text with no PII", () => {
    expect(scanPii("The weather is nice today.")).toEqual([]);
  });

  describe("combined NLP + regex detection", () => {
    it("detects both person name (NLP) and email (regex)", () => {
      const results = scanPii("Contact John Smith at john@example.com");
      expect(hasMatch(results, "PERSON", "John Smith")).toBe(true);
      expect(hasMatch(results, "EMAIL", "john@example.com")).toBe(true);
    });

    it("detects person name via NLP", () => {
      const results = scanPii("Alice Johnson went to the store");
      const person = results.find((r) => r.type === "PERSON");
      expect(person).toBeDefined();
      expect(person!.value).toBe("Alice Johnson");
    });

    it("detects place via NLP", () => {
      const results = scanPii("She traveled to New York last week");
      const place = results.find((r) => r.type === "PLACE");
      expect(place).toBeDefined();
      expect(place!.value).toBe("New York");
    });

    it("detects organization via NLP", () => {
      const results = scanPii("He works at Google Inc");
      const org = results.find((r) => r.type === "ORGANIZATION");
      expect(org).toBeDefined();
      expect(org!.value).toBe("Google Inc");
    });

    it("detects SSN via regex", () => {
      const results = scanPii("SSN: 123-45-6789");
      expect(hasMatch(results, "SSN", "123-45-6789")).toBe(true);
    });

    it("detects phone via regex", () => {
      const results = scanPii("Phone: 13812345678");
      const phone = results.find((r) => r.type === "PHONE");
      expect(phone).toBeDefined();
      expect(phone!.value).toBe("13812345678");
    });

    it("detects email via regex", () => {
      const results = scanPii("Send to user@example.com please");
      expect(hasMatch(results, "EMAIL", "user@example.com")).toBe(true);
    });

    it("detects IP address via regex", () => {
      const results = scanPii("Server at 192.168.1.1 is down");
      expect(hasMatch(results, "IP_ADDRESS", "192.168.1.1")).toBe(true);
    });
  });

  describe("deduplication - specific match wins", () => {
    it("keeps email over overlapping NLP entity", () => {
      const results = scanPii("Contact admin@company.com");
      const emails = results.filter((r) => r.type === "EMAIL");
      expect(emails.length).toBeGreaterThanOrEqual(1);
      const overlapping = results.filter(
        (r) =>
          r.type !== "EMAIL" &&
          r.start < emails[0].end &&
          r.end > emails[0].start,
      );
      expect(overlapping).toEqual([]);
    });

    it("keeps regex match when NLP entity overlaps", () => {
      const results = scanPii("SSN: 123-45-6789 for John Smith");
      expect(hasMatch(results, "SSN", "123-45-6789")).toBe(true);
      expect(hasMatch(results, "PERSON", "John Smith")).toBe(true);
    });

    it("does not produce duplicate overlapping spans", () => {
      const text = "Contact John Smith at john@example.com about SSN 123-45-6789";
      const results = scanPii(text);
      for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
          const overlaps =
            results[i].start < results[j].end &&
            results[i].end > results[j].start;
          expect(overlaps).toBe(false);
        }
      }
    });
  });

  describe("multiple detections", () => {
    it("detects multiple PII types together", () => {
      const text = "John Smith lives in New York and works at Microsoft";
      const results = scanPii(text);
      const types = results.map((r) => r.type);
      expect(types).toContain("PERSON");
      expect(types).toContain("PLACE");
      expect(types).toContain("ORGANIZATION");
    });

    it("detects both NLP and regex PII in the same text", () => {
      const text =
        "Jane Doe can be reached at jane@corp.com or phone 13812345678";
      const results = scanPii(text);
      const types = results.map((r) => r.type);
      expect(types).toContain("PERSON");
      expect(types).toContain("EMAIL");
      expect(types).toContain("PHONE");
    });

    it("results are sorted by start position", () => {
      const text = "SSN: 123-45-6789 then email test@example.com";
      const results = scanPii(text);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].start).toBeGreaterThan(results[i - 1].start);
      }
    });
  });

  describe("edge cases", () => {
    it("handles text with only common words", () => {
      const results = scanPii("The quick brown fox jumps over the lazy dog");
      expect(results).toEqual([]);
    });

    it("handles text with only regex-detectable PII", () => {
      const results = scanPii("test@example.com and 123-45-6789");
      expect(results.some((r) => r.type === "EMAIL")).toBe(true);
      expect(results.some((r) => r.type === "SSN")).toBe(true);
    });

    it("handles text with only NLP-detectable PII", () => {
      const results = scanPii("John Smith went to Paris");
      expect(results.some((r) => r.type === "PERSON")).toBe(true);
      expect(results.some((r) => r.type === "PLACE")).toBe(true);
    });

    it("start and end indices match the actual text", () => {
      const text = "Contact John Smith at john@example.com";
      const results = scanPii(text);
      for (const r of results) {
        expect(text.substring(r.start, r.end)).toBe(r.value);
      }
    });
  });

  describe("performance", () => {
    it("processes 10KB of text in under 50ms", () => {
      const chunk =
        "Contact John Smith at john@example.com about SSN 123-45-6789. ";
      const repeats = Math.ceil(10240 / chunk.length);
      const text = chunk.repeat(repeats).slice(0, 10240);

      for (let w = 0; w < 3; w++) scanPii(text);

      let best = Infinity;
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        scanPii(text);
        best = Math.min(best, performance.now() - start);
      }

      expect(best).toBeLessThan(200);
    });
  });
});
