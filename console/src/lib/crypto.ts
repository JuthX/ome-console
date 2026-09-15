import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Sprint 8b: encrypts server-registry access tokens at rest. Node-runtime
// only (route handlers) — unlike auth/session.ts this never needs to run in
// the Edge runtime, so plain node:crypto is fine here.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey(): Buffer {
  const key = process.env.CONSOLE_ENCRYPTION_KEY;
  if (!key) throw new Error("CONSOLE_ENCRYPTION_KEY must be set");
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("CONSOLE_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of `openssl rand -base64 32`)");
  }
  return buf;
}

/** Stored format: base64(iv[12] + authTag[16] + ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(stored: string): string {
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
