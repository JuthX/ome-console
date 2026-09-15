import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import type { CreateOutputProfileRequest } from "@/ome-client/types";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const vhost = searchParams.get("vhost");
  const app = searchParams.get("app");
  if (!vhost || !app) {
    return NextResponse.json({ error: "vhost and app are required" }, { status: 400 });
  }
  try {
    const client = getOmeClient();
    const names = await client.listOutputProfiles(vhost, app);
    const profiles = await Promise.all(names.map((name) => client.getOutputProfile(vhost, app, name)));
    return NextResponse.json({ profiles });
  } catch (err) {
    return omeErrorResponse(err);
  }
}

// Restarts the app on success (PRD §6 #2) — the caller must have already
// shown the restart-warning confirmation naming the app + live session
// count before calling this. 403s for a Server.xml-declared app (PRD §6
// #1) — that's expected, not handled specially: the operator's attempt
// hits the real error rather than a disabled control.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, ...rest } = body ?? {};
  if (!vhost || !app || !rest.name || !rest.outputStreamName) {
    return NextResponse.json({ error: "vhost, app, name and outputStreamName are required" }, { status: 400 });
  }
  try {
    await getOmeClient().createOutputProfile(vhost, app, rest as CreateOutputProfileRequest);
    const actor = await getCurrentUsername();
    writeAudit(actor, "output-profile.create", `${vhost}/${app}/${rest.name}`, null);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return omeErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const vhost = searchParams.get("vhost");
  const app = searchParams.get("app");
  const name = searchParams.get("name");
  if (!vhost || !app || !name) {
    return NextResponse.json({ error: "vhost, app and name are required" }, { status: 400 });
  }
  try {
    await getOmeClient().deleteOutputProfile(vhost, app, name);
    const actor = await getCurrentUsername();
    writeAudit(actor, "output-profile.delete", `${vhost}/${app}/${name}`, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
