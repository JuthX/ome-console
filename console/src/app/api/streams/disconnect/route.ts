import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, stream } = body ?? {};
  if (!vhost || !app || !stream) {
    return NextResponse.json({ error: "vhost, app and stream are required" }, { status: 400 });
  }
  try {
    await getOmeClient().deleteStream(vhost, app, stream);
    const actor = await getCurrentUsername();
    writeAudit(actor, "stream.disconnect", `${vhost}/${app}/${stream}`, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
