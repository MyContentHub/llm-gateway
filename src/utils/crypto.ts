import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import * as argon2 from "argon2";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

export function encryptAes256Gcm(plaintext: string, masterKey: string): string {
  const key = createHash("sha256").update(masterKey).digest();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptAes256Gcm(encrypted: string, masterKey: string): string {
  const key = createHash("sha256").update(masterKey).digest();
  const data = Buffer.from(encrypted, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

export async function hashApiKey(apiKey: string): Promise<string> {
  return argon2.hash(apiKey, { type: argon2.argon2id });
}

export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, apiKey);
  } catch {
    return false;
  }
}

export function generateApiKey(): string {
  return "gwk_" + randomBytes(16).toString("hex");
}
