import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { removeDesiredPush } from "@/db/desiredState";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, id } = body ?? {};
  if (!vhost || !app || !id) {
    return NextResponse.json({ error: "vhost, app and id are required" }, { status: 400 });
  }
  try {
    await getOmeClient().stopPush(vhost, app, id);
    // An explicit stop is a deliberate operator decision — don't let the
    // reconciler auto-heal it back on the next OME restart/reconnect.
    removeDesiredPush(vhost, app, id);
    const actor = await getCurrentUsername();
    writeAudit(actor, "push.stop", `${vhost}/${app}`, { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
