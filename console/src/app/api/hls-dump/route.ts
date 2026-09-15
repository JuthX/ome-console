import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import type { StartHlsDumpRequest } from "@/ome-client/types";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, stream, ...rest } = body ?? {};
  if (!vhost || !app || !stream || !rest.id || !rest.outputPath) {
    return NextResponse.json({ error: "vhost, app, stream, id and outputPath are required" }, { status: 400 });
  }
  try {
    await getOmeClient().startHlsDump(vhost, app, stream, {
      outputStreamName: stream,
      ...rest,
    } as StartHlsDumpRequest);
    const actor = await getCurrentUsername();
    writeAudit(actor, "hls-dump.start", `${vhost}/${app}/${stream}`, { id: rest.id, outputPath: rest.outputPath });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
