import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { writeAudit } from "@/db/audit";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function POST(req: NextRequest) {
  const { vhost } = (await req.json()) ?? {};
  if (!vhost) {
    return NextResponse.json({ error: "vhost is required" }, { status: 400 });
  }
  try {
    await getOmeClient().reloadCertificate(vhost);
    const actor = await getCurrentUsername();
    writeAudit(actor, "vhost.reload-certificate", vhost, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
