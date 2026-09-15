import { NextRequest, NextResponse } from "next/server";
import { OmeClient } from "@/ome-client/client";
import { getServerConnection, touchServerSeen } from "@/db/servers";
import { checkTargetUrlSafety } from "@/lib/urlSafety";

// One-shot connectivity check only (GET /v1/version) — explicitly not a
// step towards operational multi-server switching (PRD §5, Tier-4 backlog).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { id, api_base_url, access_token } = body ?? {};

  let connection: { apiBaseUrl: string; accessToken: string } | undefined;
  if (id !== undefined) {
    connection = getServerConnection(Number(id));
    if (!connection) return NextResponse.json({ error: "server not found" }, { status: 404 });
  } else if (api_base_url && access_token) {
    connection = { apiBaseUrl: api_base_url, accessToken: access_token };
  } else {
    return NextResponse.json({ error: "id, or api_base_url and access_token, are required" }, { status: 400 });
  }

  // This is an authenticated-fetch oracle by design (that's the feature) —
  // the SSRF-relevant part is *what host* it's allowed to point at.
  const safety = checkTargetUrlSafety(connection.apiBaseUrl);
  if (!safety.ok) {
    return NextResponse.json({ ok: false, error: safety.reason });
  }

  try {
    const client = new OmeClient({ baseUrl: connection.apiBaseUrl, accessToken: connection.accessToken });
    const { version } = await client.getVersion();
    if (id !== undefined) touchServerSeen(Number(id), version);
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
