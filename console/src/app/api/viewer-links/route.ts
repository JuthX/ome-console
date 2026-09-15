import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { signUrl } from "@/lib/signedPolicy";
import { getCurrentUsername } from "@/auth/currentUser";

// Viewer links — enforced entirely by OME itself via SignedPolicy, no
// callback to the console (unlike publish keys/admission-webhook). Only
// webrtc/llhls are offered: those are the only two protocols enabled in
// Server.xml's <SignedPolicy><Enables><Publishers> this sprint — OME has no
// SRT *publisher* configured in this deployment (SRT is provider/ingest
// only today), so an "SRT viewer link" would sign a URL nothing serves.
const VHOST = process.env.OME_DEFAULT_VHOST ?? "default";

export interface ViewerLinkRow {
  id: number;
  stream_name: string;
  protocol: string;
  url: string;
  expires_at: string | null;
  created_at: string;
}

const VALID_FOR_HOURS: Record<string, number> = {
  "4h": 4,
  show: 12,
  none: 10 * 365 * 24, // "no expiry" — SignedPolicy's url_expire is a required field, so approximate with 10 years
};

// Port 3334 (OME's own TLS listener), NOT 443/NPM — confirmed empirically
// against a real instance that OME's SignedPolicy validates a signature
// against the exact scheme/host/port *it* receives; a TLS-terminating
// reverse proxy like NPM changes those, which silently breaks every signed
// link even though everything else about the URL looks right. Explicit
// port is also required by OME's own docs regardless of proxying — omitting
// even a "default" port is the #1 way a signature silently fails to match.
function baseUrl(format: string, app: string, stream: string): string {
  const domain = process.env.MEDIA_DOMAIN;
  if (format === "llhls") return `https://${domain}:3334/${app}/${stream}/llhls.m3u8`;
  return `wss://${domain}:3334/${app}/${stream}`;
}

export async function GET() {
  const links = db.prepare(`SELECT * FROM viewer_links ORDER BY created_at DESC`).all() as ViewerLinkRow[];
  return NextResponse.json({ links });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { app, stream_name, format, valid_for } = body ?? {};
  if (!app || !stream_name || !format) {
    return NextResponse.json({ error: "app, stream_name and format are required" }, { status: 400 });
  }
  const secret = process.env.SIGNED_POLICY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SIGNED_POLICY_SECRET is not configured" }, { status: 500 });
  }

  const hours = VALID_FOR_HOURS[valid_for] ?? VALID_FOR_HOURS["4h"];
  const urlExpire = Date.now() + hours * 60 * 60 * 1000;
  const signedUrl = await signUrl(baseUrl(format, app, stream_name), { url_expire: urlExpire }, secret);

  const result = db
    .prepare(`INSERT INTO viewer_links (stream_name, protocol, url, expires_at) VALUES (?, ?, ?, ?)`)
    .run(stream_name, format, signedUrl, new Date(urlExpire).toISOString());
  const link = db.prepare(`SELECT * FROM viewer_links WHERE id = ?`).get(result.lastInsertRowid) as ViewerLinkRow;
  writeAudit(await getCurrentUsername(), "viewer-link.create", `${VHOST}/${app}/${stream_name}`, { format, id: link.id });
  return NextResponse.json({ link }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  db.prepare(`DELETE FROM viewer_links WHERE id = ?`).run(id);
  writeAudit(await getCurrentUsername(), "viewer-link.delete", id, null);
  return NextResponse.json({ ok: true });
}
