import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { getCurrentUsername } from "@/auth/currentUser";

// Publish keys — console-owned, enforced live by /api/admission-webhook on
// every connection attempt (not signed URLs; see plan's rationale: instant
// revoke + free "last used" tracking, which a static signed URL can't give).
// The `keys` table (Sprint 2) has no vhost/app columns — this deployment has
// exactly one of each, so the plain connection URL is built against those
// fixed values (configured via the setup wizard, `OME_DEFAULT_VHOST`/
// `OME_DEFAULT_APP` in .env) rather than adding a schema migration for a
// distinction that doesn't exist here yet.
const VHOST = process.env.OME_DEFAULT_VHOST ?? "default";
const APP = process.env.OME_DEFAULT_APP ?? "app";

export interface KeyRow {
  id: number;
  stream_name: string;
  protocol: string;
  holder: string;
  expires_at: string | null;
  revoked: number;
  last_used_at: string | null;
  created_at: string;
}

function connectionUrl(streamName: string, protocol: string): string {
  const host = process.env.OME_HOST_IP;
  const rtmpPort = process.env.OME_RTMP_PROV_PORT ?? "1935";
  const srtPort = process.env.OME_SRT_PROV_PORT ?? "9999";
  if (protocol === "srt") return `srt://${host}:${srtPort}?streamid=${VHOST}/${APP}/${streamName}`;
  return `rtmp://${host}:${rtmpPort}/${APP}/${streamName}`;
}

export async function GET() {
  const keys = db.prepare(`SELECT * FROM keys ORDER BY created_at DESC`).all() as KeyRow[];
  return NextResponse.json({
    keys: keys.map((k) => ({ ...k, url: connectionUrl(k.stream_name, k.protocol) })),
  });
}

// admission-webhook's `expires_at > datetime('now')` check compares TEXT
// byte-for-byte — it must be SQLite's own "YYYY-MM-DD HH:MM:SS" (space, UTC,
// with seconds), not a "T"-separated ISO string, or the 'T' (0x54) sorting
// above a space (0x20) makes any same-day expiry look "not yet expired" for
// the entire day regardless of the actual time. Expects a full ISO string
// from the client (`new Date(...).toISOString()`), not a raw
// `datetime-local` value (which has no timezone and no seconds).
function toSqliteDatetime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { stream_name, protocol, holder, expires_at } = body ?? {};
  if (!stream_name || !protocol || !holder) {
    return NextResponse.json({ error: "stream_name, protocol and holder are required" }, { status: 400 });
  }
  const result = db
    .prepare(`INSERT INTO keys (stream_name, protocol, holder, expires_at) VALUES (?, ?, ?, ?)`)
    .run(stream_name, protocol, holder, expires_at ? toSqliteDatetime(expires_at) : null);
  const key = db.prepare(`SELECT * FROM keys WHERE id = ?`).get(result.lastInsertRowid) as KeyRow;
  writeAudit(await getCurrentUsername(), "key.create", `${key.stream_name}/${key.protocol}`, { holder, id: key.id });
  return NextResponse.json({ key: { ...key, url: connectionUrl(key.stream_name, key.protocol) } }, { status: 201 });
}

// Revoke is a live state change (blocks future admission immediately, keeps
// the row and its Last used history) — separate from DELETE (removal),
// matching how Users separates PATCH (reset password) from DELETE (remove
// account). Previously this was done on DELETE, which meant a revoked key
// could never actually be removed from the table.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id } = body ?? {};
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  db.prepare(`UPDATE keys SET revoked = 1 WHERE id = ?`).run(id);
  // `id` here comes from a JSON body (a JS number), unlike DELETE's
  // searchParams.get (always a string) — writeAudit's target is typed
  // string | null, so stringify explicitly rather than let a plain number
  // through un-normalized.
  writeAudit(await getCurrentUsername(), "key.revoke", String(id), null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  db.prepare(`DELETE FROM keys WHERE id = ?`).run(id);
  writeAudit(await getCurrentUsername(), "key.delete", id, null);
  return NextResponse.json({ ok: true });
}
