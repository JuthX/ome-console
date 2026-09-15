import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

// Every configured app (declared in Server.xml), independent of whether it
// currently has a live input stream — push/record targets can be created
// for an app before any publisher connects (PRD §6 #5), so the picker needs
// this instead of deriving apps from the live SSE snapshot alone.
export async function GET() {
  try {
    const client = getOmeClient();
    const vhosts = await client.listVhosts();
    const apps: { vhost: string; app: string }[] = [];
    for (const vhost of vhosts) {
      const appNames = await client.listApps(vhost);
      for (const app of appNames) apps.push({ vhost, app });
    }
    return NextResponse.json({ apps });
  } catch (err) {
    return omeErrorResponse(err);
  }
}

// Sprint 6: providers/publishers editing. Restarts the app on success (PRD
// §6 #2) — the caller is responsible for the restart-warning confirmation
// before calling this; 403s outright for a Server.xml-declared app
// (AppInfo.dynamic === false), which is the only kind that exists in this
// deployment today.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, ...rest } = body ?? {};
  if (!vhost || !app) {
    return NextResponse.json({ error: "vhost and app are required" }, { status: 400 });
  }
  try {
    await getOmeClient().patchApp(vhost, app, rest);
    const actor = await getCurrentUsername();
    writeAudit(actor, "app.patch", `${vhost}/${app}`, rest);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
