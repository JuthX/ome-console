/**
 * Blocks the most dangerous classes of target for a server-side,
 * authenticated fetch to a client-supplied URL (/api/servers/test) —
 * loopback and link-local addresses, notably the cloud metadata endpoint
 * 169.254.169.254. Deliberately does NOT block RFC1918 private ranges: a
 * real second OME server is plausibly on the same LAN, and blocking that
 * would break the feature for a real, legitimate use case. This is a
 * meaningful reduction in SSRF blast radius, not a complete SSRF defense —
 * an Engineer-role account (the only role that can reach this route) could
 * still probe other hosts on the same private network.
 */
export function checkTargetUrlSafety(urlStr: string): { ok: true } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "only http:// and https:// URLs are allowed" };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (hostname === "localhost" || hostname === "::1") {
    return { ok: false, reason: "loopback addresses are not allowed" };
  }

  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1, 3).map(Number);
    if (a === 127) return { ok: false, reason: "loopback addresses are not allowed" };
    if (a === 169 && b === 254) return { ok: false, reason: "link-local addresses are not allowed" };
  }

  if (hostname.startsWith("fe80:")) {
    return { ok: false, reason: "link-local addresses are not allowed" };
  }

  return { ok: true };
}
