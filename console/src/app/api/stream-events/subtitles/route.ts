import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, stream, label, text, startOffset, durationMs } = body ?? {};
  if (!vhost || !app || !stream || !label || !text) {
    return NextResponse.json({ error: "vhost, app, stream, label and text are required" }, { status: 400 });
  }
  try {
    // OME can reject this with a 500 if the stream has no active session
    // capable of receiving WebVTT (confirmed against the real instance) —
    // surfaced to the operator as a normal form error, not a bug.
    await getOmeClient().sendSubtitles(vhost, app, stream, {
      format: "webvtt",
      data: [{ label, subtitles: [{ text, startOffset, durationMs }] }],
    });
    const actor = await getCurrentUsername();
    writeAudit(actor, "stream.send-subtitles", `${vhost}/${app}/${stream}`, { label });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
