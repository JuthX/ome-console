import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, stream, id } = body ?? {};
  if (!vhost || !app || !stream || !id) {
    return NextResponse.json({ error: "vhost, app, stream and id are required" }, { status: 400 });
  }
  try {
    await getOmeClient().stopHlsDump(vhost, app, stream, id);
    const actor = await getCurrentUsername();
    writeAudit(actor, "hls-dump.stop", `${vhost}/${app}/${stream}`, { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
