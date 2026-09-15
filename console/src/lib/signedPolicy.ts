// Sprint 7a: OME's SignedPolicy (viewer links) and AdmissionWebhooks
// (publish keys) both use HMAC-SHA1 + base64url — confirmed against OME's
// own `misc/signed_policy_url_generator.sh` and `misc/conf_examples/Server.xml`
// on GitHub, not just the docs prose (which has a stale example elsewhere in
// the same doc set). Uses Web Crypto (globalThis.crypto.subtle), same as
// src/auth/session.ts, so this runs unchanged in both the Node route-handler
// runtime and the Edge/proxy runtime without a runtime flag.

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
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

export async function hmacSha1Key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
    "verify",
  ]);
}

export interface SignedPolicyPayload {
  url_expire: number; // ms since epoch, required
  url_activate?: number;
  stream_expire?: number;
  allow_ip?: string;
  real_ip?: string;
}

/**
 * `baseUrl` must already include an explicit port (e.g. `:3334`, `:1935`) —
 * OME's own docs flag this as the #1 way a generated signature silently
 * fails to match: omitting a default port breaks it even though the URL
 * still "looks" complete.
 */
/**
 * `secretOrKey` accepts either the raw secret (imports a fresh key each
 * call — fine for one-off signing) or a `CryptoKey` already imported via
 * `hmacSha1Key()` — pass that for a bulk operation (e.g. re-signing every
 * viewer link on secret rotation) so the same key isn't re-imported once
 * per link.
 */
export async function signUrl(
  baseUrl: string,
  policy: SignedPolicyPayload,
  secretOrKey: string | CryptoKey,
): Promise<string> {
  const policyBase64 = toBase64Url(encoder.encode(JSON.stringify(policy)));
  const separator = baseUrl.includes("?") ? "&" : "?";
  const urlWithPolicy = `${baseUrl}${separator}policy=${policyBase64}`;
  const key = typeof secretOrKey === "string" ? await hmacSha1Key(secretOrKey) : secretOrKey;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(urlWithPolicy));
  return `${urlWithPolicy}&signature=${toBase64Url(signature)}`;
}

/** Verifies OME's `X-OME-Signature` header: base64url(HMAC-SHA1(secret, rawRequestBody)). */
export async function verifyAdmissionSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const signatureBytes = fromBase64Url(signatureHeader);
  if (!signatureBytes) return false;
  const key = await hmacSha1Key(secret);
  return crypto.subtle.verify("HMAC", key, signatureBytes.buffer as ArrayBuffer, encoder.encode(rawBody));
}
