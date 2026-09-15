import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import type { StartRecordRequest } from "@/ome-client/types";
import { writeAudit } from "@/db/audit";
import { upsertDesiredRecord } from "@/db/desiredState";
import { omeErrorResponse } from "@/lib/api-error";
import { getCurrentUsername } from "@/auth/currentUser";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const vhost = searchParams.get("vhost");
  const app = searchParams.get("app");
  if (!vhost || !app) {
    return NextResponse.json({ error: "vhost and app are required" }, { status: 400 });
  }
  try {
    const records = await getOmeClient().listRecords(vhost, app);
    return NextResponse.json({ records });
  } catch (err) {
    return omeErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // `label` is console-only bookkeeping (see push/route.ts) — not sent to OME.
  const { vhost, app, label, ...rest } = body ?? {};
  if (!vhost || !app || !rest.id || !rest.stream?.name) {
    return NextResponse.json({ error: "vhost, app, id and stream.name are required" }, { status: 400 });
  }
  try {
    const task = await getOmeClient().startRecord(vhost, app, rest as StartRecordRequest);
    upsertDesiredRecord(vhost, app, rest.stream.name, { ...(rest as StartRecordRequest), label });
    const actor = await getCurrentUsername();
    writeAudit(actor, "record.start", `${vhost}/${app}/${rest.stream.name}`, { id: rest.id });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
