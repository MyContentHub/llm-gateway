import { describe, it, expect } from "vitest";
import { scanPII, createPlaceholderNamer } from "./pii-patterns.js";

describe("scanPII", () => {
  describe("EMAIL", () => {
    it("detects standard email", () => {
      const results = scanPII("My email is test@example.com");
      expect(results).toContainEqual({
        type: "EMAIL",
        value: "test@example.com",
        start: 12,
        end: 28,
      });
    });

    it("detects email with dots in local part", () => {
      const results = scanPII("Contact: first.last@company.co.uk");
      const email = results.find((r) => r.type === "EMAIL");
      expect(email).toBeDefined();
      expect(email!.value).toBe("first.last@company.co.uk");
    });

    it("detects email with plus sign", () => {
      const results = scanPII("Send to user+tag@gmail.com please");
      const email = results.find((r) => r.type === "EMAIL");
      expect(email).toBeDefined();
      expect(email!.value).toBe("user+tag@gmail.com");
    });

    it("detects multiple emails", () => {
      const results = scanPII("a@b.com and c@d.com");
      const emails = results.filter((r) => r.type === "EMAIL");
      expect(emails).toHaveLength(2);
      expect(emails[0].value).toBe("a@b.com");
      expect(emails[1].value).toBe("c@d.com");
    });
  });

  describe("SSN", () => {
    it("detects SSN: 123-45-6789", () => {
      const results = scanPII("SSN: 123-45-6789");
      expect(results).toContainEqual({
        type: "SSN",
        value: "123-45-6789",
        start: 5,
        end: 16,
      });
    });

    it("detects valid SSN with non-zero parts", () => {
      const results = scanPII("Number is 456-78-9012 ok");
      const ssn = results.find((r) => r.type === "SSN");
      expect(ssn).toBeDefined();
      expect(ssn!.value).toBe("456-78-9012");
    });

    it("does not match 000-00-0000", () => {
      const results = scanPII("000-00-0000");
      const ssn = results.find((r) => r.type === "SSN");
      expect(ssn).toBeUndefined();
    });
  });

  describe("CN_ID (Chinese National ID)", () => {
    it("detects Chinese ID 110101199001011234", () => {
      const results = scanPII("ID: 110101199001011234");
      expect(results).toContainEqual({
        type: "CN_ID",
        value: "110101199001011234",
        start: 4,
        end: 22,
      });
    });

    it("detects CN ID ending with X", () => {
      const results = scanPII("身份证号 11010520001222123X");
      const cnId = results.find((r) => r.type === "CN_ID");
      expect(cnId).toBeDefined();
      expect(cnId!.value).toBe("11010520001222123X");
    });

    it("does not match invalid CN ID starting with 0", () => {
      const results = scanPII("011010199001011234");
      const cnId = results.find((r) => r.type === "CN_ID");
      expect(cnId).toBeUndefined();
    });
  });

  describe("PHONE", () => {
    it("detects Chinese phone 13812345678", () => {
      const results = scanPII("Phone: 13812345678");
      expect(results).toContainEqual({
        type: "PHONE",
        value: "13812345678",
        start: 7,
        end: 18,
      });
    });

    it("detects US phone (XXX) XXX-XXXX", () => {
      const results = scanPII("Call (415) 555-1234");
      const phone = results.find((r) => r.type === "PHONE");
      expect(phone).toBeDefined();
      expect(phone!.value).toBe("(415) 555-1234");
    });

    it("detects US phone XXX-XXX-XXXX", () => {
      const results = scanPII("Call 415-555-1234 now");
      const phone = results.find((r) => r.type === "PHONE");
      expect(phone).toBeDefined();
      expect(phone!.value).toBe("415-555-1234");
    });

    it("detects +1 prefixed US phone", () => {
      const results = scanPII("Number: +1-415-555-1234");
      const phone = results.find((r) => r.type === "PHONE");
      expect(phone).toBeDefined();
    });
  });

  describe("CREDIT_CARD", () => {
    it("detects valid credit card number", () => {
      const results = scanPII("Card: 4111111111111111");
      const cc = results.find((r) => r.type === "CREDIT_CARD");
      expect(cc).toBeDefined();
      expect(cc!.value).toBe("4111111111111111");
    });

    it("detects credit card with spaces", () => {
      const results = scanPII("Card: 4111 1111 1111 1111");
      const cc = results.find((r) => r.type === "CREDIT_CARD");
      expect(cc).toBeDefined();
    });

    it("rejects invalid credit card (Luhn fail)", () => {
      const results = scanPII("Card: 1234567890123456");
      const cc = results.find((r) => r.type === "CREDIT_CARD");
      expect(cc).toBeUndefined();
    });
  });

  describe("IP_ADDRESS", () => {
    it("detects IPv4 address", () => {
      const results = scanPII("Server at 192.168.1.1 is down");
      expect(results).toContainEqual({
        type: "IP_ADDRESS",
        value: "192.168.1.1",
        start: 10,
        end: 21,
      });
    });

    it("detects 10.0.0.1", () => {
      const results = scanPII("Connect to 10.0.0.1");
      const ip = results.find((r) => r.type === "IP_ADDRESS");
      expect(ip).toBeDefined();
      expect(ip!.value).toBe("10.0.0.1");
    });

    it("does not match invalid octet 256", () => {
      const results = scanPII("IP is 256.1.1.1");
      const ip = results.find((r) => r.type === "IP_ADDRESS");
      expect(ip).toBeUndefined();
    });
  });

  describe("DATE_OF_BIRTH", () => {
    it("detects YYYY-MM-DD format", () => {
      const results = scanPII("DOB: 1990-01-15");
      const dob = results.find((r) => r.type === "DATE_OF_BIRTH");
      expect(dob).toBeDefined();
      expect(dob!.value).toBe("1990-01-15");
    });

    it("detects MM/DD/YYYY format", () => {
      const results = scanPII("Born on 01/15/1990");
      const dob = results.find((r) => r.type === "DATE_OF_BIRTH");
      expect(dob).toBeDefined();
      expect(dob!.value).toBe("01/15/1990");
    });
  });

  describe("empty / no PII", () => {
    it("returns empty array for text with no PII", () => {
      const results = scanPII("Hello world, this is a normal sentence.");
      expect(results).toEqual([]);
    });

    it("returns empty array for empty string", () => {
      expect(scanPII("")).toEqual([]);
    });
  });

  describe("multiple PII types and deduplication", () => {
    it("detects multiple PII of different types", () => {
      const text = "Email test@example.com and SSN 123-45-6789";
      const results = scanPII(text);
      expect(results.length).toBeGreaterThanOrEqual(2);
      const types = results.map((r) => r.type);
      expect(types).toContain("EMAIL");
      expect(types).toContain("SSN");
    });

    it("detects multiple PII of the same type with positions", () => {
      const text = "a@b.com and c@d.com";
      const results = scanPII(text);
      const emails = results.filter((r) => r.type === "EMAIL");
      expect(emails).toHaveLength(2);
      expect(emails[0].start).toBeLessThan(emails[1].start);
    });

    it("deduplicates overlapping matches", () => {
      const text = "test@example.com";
      const results = scanPII(text);
      const positions = results.map((r) => `${r.start}-${r.end}`);
      const uniquePositions = new Set(positions);
      expect(positions.length).toBe(uniquePositions.size);
    });

    it("sorts results by start position", () => {
      const text = "SSN: 123-45-6789 then email test@example.com";
      const results = scanPII(text);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].start).toBeGreaterThan(results[i - 1].start);
      }
    });
  });

  describe("mixed content and edge cases", () => {
    it("handles PII embedded in longer text", () => {
      const text = "The user registered with test@example.com on 2024-01-01 from 192.168.0.1";
      const results = scanPII(text);
      const types = results.map((r) => r.type);
      expect(types).toContain("EMAIL");
      expect(types).toContain("IP_ADDRESS");
    });

    it("handles Chinese text with PII", () => {
      const text = "我的手机号是13812345678，身份证是110101199001011234";
      const results = scanPII(text);
      const types = results.map((r) => r.type);
      expect(types).toContain("PHONE");
      expect(types).toContain("CN_ID");
    });

    it("returns correct start and end indices for non-ASCII text", () => {
      const text = "邮箱test@example.com结束";
      const results = scanPII(text);
      const email = results.find((r) => r.type === "EMAIL");
      expect(email).toBeDefined();
      expect(text.substring(email!.start, email!.end)).toBe("test@example.com");
    });
  });
});

describe("createPlaceholderNamer", () => {
  it("generates sequential placeholders", () => {
    const namer = createPlaceholderNamer();
    expect(namer("EMAIL")).toBe("[EMAIL_1]");
    expect(namer("EMAIL")).toBe("[EMAIL_2]");
    expect(namer("SSN")).toBe("[SSN_1]");
    expect(namer("EMAIL")).toBe("[EMAIL_3]");
  });

  it("maintains independent counters per type", () => {
    const namer = createPlaceholderNamer();
    expect(namer("PHONE")).toBe("[PHONE_1]");
    expect(namer("CN_ID")).toBe("[CN_ID_1]");
    expect(namer("PHONE")).toBe("[PHONE_2]");
  });
});
