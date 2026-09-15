import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, name, url, persistent } = body ?? {};
  if (!vhost || !app || !name || !url) {
    return NextResponse.json({ error: "vhost, app, name and url are required" }, { status: 400 });
  }
  try {
    await getOmeClient().createPullStream(vhost, app, {
      name,
      urls: [url],
      properties: persistent ? { persistent: true } : undefined,
    });
    const actor = await getCurrentUsername();
    writeAudit(actor, "stream.pull-create", `${vhost}/${app}/${name}`, { url });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
