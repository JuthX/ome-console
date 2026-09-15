import { NextRequest, NextResponse } from "next/server";
import { createServer, deleteServer, listServers } from "@/db/servers";
import { writeAudit } from "@/db/audit";
import { getCurrentUsername } from "@/auth/currentUser";

// Sprint 8b: the servers table's data-model-only scope (PRD §5, Tier-4
// backlog) — this is registry bookkeeping, never wired into the poller/
// reconciler/alert-evaluator, which all still operate against exactly one
// OME instance (the env-var-configured one).

export async function GET() {
  return NextResponse.json({ servers: listServers() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, api_base_url, access_token } = body ?? {};
  if (!name || !api_base_url || !access_token) {
    return NextResponse.json({ error: "name, api_base_url and access_token are required" }, { status: 400 });
  }
  const server = createServer(name, api_base_url, access_token);
  writeAudit(await getCurrentUsername(), "server.create", name, { id: server.id, api_base_url });
  return NextResponse.json({ server }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  deleteServer(Number(id));
  writeAudit(await getCurrentUsername(), "server.delete", id, null);
  return NextResponse.json({ ok: true });
}
