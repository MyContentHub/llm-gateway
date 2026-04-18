import { describe, it, expect } from "vitest";
import {
  encryptAes256Gcm,
  decryptAes256Gcm,
  hashApiKey,
  verifyApiKey,
  generateApiKey,
} from "./crypto.js";

const MASTER_KEY = "test-master-key-1234567890-abcdef";

describe("encryptAes256Gcm / decryptAes256Gcm", () => {
  it("roundtrips plaintext through encrypt then decrypt", () => {
    const plaintext = "sk-proj-abc123secret";
    const encrypted = encryptAes256Gcm(plaintext, MASTER_KEY);
    const decrypted = decryptAes256Gcm(encrypted, MASTER_KEY);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plaintext = "same-input";
    const a = encryptAes256Gcm(plaintext, MASTER_KEY);
    const b = encryptAes256Gcm(plaintext, MASTER_KEY);
    expect(a).not.toBe(b);
    expect(decryptAes256Gcm(a, MASTER_KEY)).toBe(plaintext);
    expect(decryptAes256Gcm(b, MASTER_KEY)).toBe(plaintext);
  });

  it("throws when decrypting with wrong master key", () => {
    const encrypted = encryptAes256Gcm("secret", MASTER_KEY);
    expect(() => decryptAes256Gcm(encrypted, "wrong-key")).toThrow();
  });

  it("throws when encrypted data is tampered", () => {
    const encrypted = encryptAes256Gcm("secret", MASTER_KEY);
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decryptAes256Gcm(tampered, MASTER_KEY)).toThrow();
  });

  it("handles empty string", () => {
    const encrypted = encryptAes256Gcm("", MASTER_KEY);
    expect(decryptAes256Gcm(encrypted, MASTER_KEY)).toBe("");
  });

  it("handles very long input", () => {
    const plaintext = "x".repeat(100_000);
    const encrypted = encryptAes256Gcm(plaintext, MASTER_KEY);
    expect(decryptAes256Gcm(encrypted, MASTER_KEY)).toBe(plaintext);
  });

  it("output is valid base64 with expected structure", () => {
    const encrypted = encryptAes256Gcm("test", MASTER_KEY);
    const buf = Buffer.from(encrypted, "base64");
    expect(buf.length).toBeGreaterThan(IV_LENGTH + AUTH_TAG_LENGTH);
  });
});

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

describe("hashApiKey / verifyApiKey", () => {
  it("roundtrips hash then verify", async () => {
    const apiKey = "gwk_abcdef1234567890";
    const hash = await hashApiKey(apiKey);
    expect(await verifyApiKey(apiKey, hash)).toBe(true);
  });

  it("returns false for wrong key", async () => {
    const hash = await hashApiKey("correct-key");
    expect(await verifyApiKey("wrong-key", hash)).toBe(false);
  });

  it("produces different hashes for same input (random salt)", async () => {
    const key = "same-key";
    const a = await hashApiKey(key);
    const b = await hashApiKey(key);
    expect(a).not.toBe(b);
  });

  it("handles empty string", async () => {
    const hash = await hashApiKey("");
    expect(await verifyApiKey("", hash)).toBe(true);
    expect(await verifyApiKey("not-empty", hash)).toBe(false);
  });

  it("handles very long key", async () => {
    const longKey = "k".repeat(10_000);
    const hash = await hashApiKey(longKey);
    expect(await verifyApiKey(longKey, hash)).toBe(true);
  });

  it("returns false for malformed hash", async () => {
    expect(await verifyApiKey("any-key", "not-a-valid-hash")).toBe(false);
  });
});

describe("generateApiKey", () => {
  it("produces key with gwk_ prefix and 32 hex chars", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^gwk_[0-9a-f]{32}$/);
  });

  it("produces unique keys", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });
});
