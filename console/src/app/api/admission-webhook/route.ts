import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { verifyAdmissionSignature } from "@/lib/signedPolicy";

// Called directly by OME (not the browser) on every RTMP/SRT/WebRTC publish
// attempt — see src/proxy.ts's PUBLIC_PATHS for the session-auth bypass;
// authenticity here is verified via X-OME-Signature instead. Contract
// confirmed against OME's own docs (POST /v1/vhosts/{vhost} AdmissionWebhooks
// section): {client, request} in, {allowed, reason?} out for "opening"
// events, {} for "closing".

interface AdmissionRequest {
  client: { address: string; port: number; real_ip?: string; user_agent?: string };
  request: {
    direction: "incoming" | "outgoing";
    protocol: string;
    status: "opening" | "closing";
    url: string;
    time: string;
  };
}

/**
 * Best-effort: OME's own docs don't give a worked example for every protocol's URL shape — verify empirically.
 * Confirmed against a real SRT publish attempt: despite the client connecting with a
 * `?streamid=...` query string (new `vhost/app/stream` form or the deprecated
 * `srt://host:port/vhost/app/stream` form), OME re-resolves it before calling this webhook —
 * the `url` field it actually sends is a plain `srt://vhost/app/stream` with no query string
 * at all. A previous version of this function assumed a `streamid` query param for SRT
 * specifically; that never matched real traffic, so every SRT key was silently denied. SRT
 * needs no special case — the same path-based extraction already used for every other
 * protocol handles both real shapes correctly.
 */
function extractStream(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.ADMISSION_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "ADMISSION_WEBHOOK_SECRET is not configured" }, { status: 500 });
  }

  const signatureOk = await verifyAdmissionSignature(rawBody, req.headers.get("X-OME-Signature"), secret);
  if (!signatureOk) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: AdmissionRequest;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (payload.request.status === "closing") {
    return NextResponse.json({});
  }

  // Confirmed against a real connection attempt: OME sends protocol as
  // "RTMP" (uppercase), not the "rtmp" its own docs example implied —
  // normalize before comparing against the `keys` table (stored lowercase,
  // matching the form's <option value>).
  const { protocol: rawProtocol, url } = payload.request;
  const protocol = rawProtocol.toLowerCase();
  const streamName = extractStream(url);

  const key = streamName
    ? (db
        .prepare(
          `SELECT * FROM keys WHERE stream_name = ? AND protocol = ? AND revoked = 0
           AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1`,
        )
        .get(streamName, protocol) as { id: number } | undefined)
    : undefined;

  const allowed = !!key;
  writeAudit("ome", allowed ? "admission.allow" : "admission.deny", streamName ?? url, {
    protocol,
    client: payload.client.address,
  });
  if (key) {
    db.prepare(`UPDATE keys SET last_used_at = datetime('now') WHERE id = ?`).run(key.id);
  }

  return NextResponse.json({
    allowed,
    reason: allowed ? undefined : "no matching key",
  });
}
