import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, stream, frameType, info, data } = body ?? {};
  if (!vhost || !app || !stream || !frameType || !data) {
    return NextResponse.json({ error: "vhost, app, stream, frameType and data are required" }, { status: 400 });
  }
  try {
    await getOmeClient().sendEvent(vhost, app, stream, {
      eventFormat: "id3v2",
      events: [{ frameType, info: info || undefined, data }],
    });
    const actor = await getCurrentUsername();
    writeAudit(actor, "stream.send-id3", `${vhost}/${app}/${stream}`, { frameType });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
