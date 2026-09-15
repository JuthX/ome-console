// Sprint 8a: real multi-user sessions, replacing Sprint 2's single hardcoded
// admin cookie. The signed payload now carries the user's identity AND
// role — role is intentionally baked in at login time rather than looked
// up fresh from the `users` table on every request, because src/proxy.ts
// (the Edge/Node-portable choke point) can't use better-sqlite3 (Node-only
// native module) from the Edge runtime. A role change takes effect on that
// user's next login — a documented tradeoff, not a bug.
//
// Uses Web Crypto (globalThis.crypto.subtle) rather than node:crypto so
// this works unchanged in both the Node runtime (server actions, route
// handlers) and the Edge runtime (proxy.ts) without a runtime flag.

import { isRole, type Role } from "./roles";

export const SESSION_COOKIE_NAME = "console_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_SECONDS;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SessionData {
  userId: number;
  username: string;
  role: Role;
}

interface SessionPayload extends SessionData {
  exp: number;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.CONSOLE_SESSION_SECRET;
  if (!secret) throw new Error("CONSOLE_SESSION_SECRET must be set");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Value to set as the session cookie after a successful login. */
export async function createSessionToken(data: SessionData): Promise<string> {
  const payload: SessionPayload = { ...data, exp: Date.now() + SESSION_TTL_SECONDS * 1000 };
  const payloadBase64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadBase64));
  return `${payloadBase64}.${toHex(signature)}`;
}

/** The session's data if the cookie is validly signed and unexpired, else null. */
export async function verifySessionToken(token: string | undefined): Promise<SessionData | null> {
  if (!token) return null;
  const [payloadBase64, signatureHex] = token.split(".");
  if (!payloadBase64 || !signatureHex) return null;

  const signatureBytes = signatureHex.match(/.{2}/g)?.map((b) => parseInt(b, 16));
  if (!signatureBytes) return null;

  const key = await hmacKey();
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(signatureBytes),
    encoder.encode(payloadBase64),
  );
  if (!valid) return null;

  const rawPayload = fromBase64Url(payloadBase64);
  if (!rawPayload) return null;

  try {
    const payload = JSON.parse(decoder.decode(rawPayload)) as SessionPayload;
    if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
    if (!isRole(payload.role) || typeof payload.username !== "string" || typeof payload.userId !== "number") {
      return null;
    }
    return { userId: payload.userId, username: payload.username, role: payload.role };
  } catch {
    return null;
  }
}
