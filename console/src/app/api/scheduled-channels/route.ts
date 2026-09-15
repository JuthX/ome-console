import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import type { CreateScheduledChannelRequest, ScheduledChannelSummary } from "@/ome-client/types";
import { writeAudit } from "@/db/audit";
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
    const client = getOmeClient();
    const names = await client.listScheduledChannels(vhost, app);
    const channels: ScheduledChannelSummary[] = await Promise.all(
      names.map(async (name) => ({ name, ...(await client.getScheduledChannel(vhost, app, name)) })),
    );
    return NextResponse.json({ channels });
  } catch (err) {
    return omeErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, ...rest } = body ?? {};
  if (!vhost || !app || !rest.stream?.name) {
    return NextResponse.json({ error: "vhost, app and stream.name are required" }, { status: 400 });
  }
  try {
    await getOmeClient().createScheduledChannel(vhost, app, rest as CreateScheduledChannelRequest);
    const actor = await getCurrentUsername();
    writeAudit(actor, "channel.scheduled.create", `${vhost}/${app}/${rest.stream.name}`, null);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return omeErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const vhost = searchParams.get("vhost");
  const app = searchParams.get("app");
  const name = searchParams.get("name");
  if (!vhost || !app || !name) {
    return NextResponse.json({ error: "vhost, app and name are required" }, { status: 400 });
  }
  try {
    await getOmeClient().deleteScheduledChannel(vhost, app, name);
    const actor = await getCurrentUsername();
    writeAudit(actor, "channel.scheduled.delete", `${vhost}/${app}/${name}`, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
