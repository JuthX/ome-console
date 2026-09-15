import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { removeDesiredRecord } from "@/db/desiredState";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, id } = body ?? {};
  if (!vhost || !app || !id) {
    return NextResponse.json({ error: "vhost, app and id are required" }, { status: 400 });
  }
  try {
    await getOmeClient().stopRecord(vhost, app, id);
    removeDesiredRecord(vhost, app, id);
    const actor = await getCurrentUsername();
    writeAudit(actor, "record.stop", `${vhost}/${app}`, { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
