import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import type { CreateMultiplexChannelRequest, MultiplexChannelSummary } from "@/ome-client/types";
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
    const names = await client.listMultiplexChannels(vhost, app);
    const channels: MultiplexChannelSummary[] = await Promise.all(
      names.map(async (name) => ({ name, ...(await client.getMultiplexChannel(vhost, app, name)) })),
    );
    return NextResponse.json({ channels });
  } catch (err) {
    return omeErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { vhost, app, ...rest } = body ?? {};
  if (!vhost || !app || !rest.outputStream?.name || !Array.isArray(rest.sourceStreams) || rest.sourceStreams.length === 0) {
    return NextResponse.json(
      { error: "vhost, app, outputStream.name and at least one sourceStream are required" },
      { status: 400 },
    );
  }
  try {
    await getOmeClient().createMultiplexChannel(vhost, app, rest as CreateMultiplexChannelRequest);
    const actor = await getCurrentUsername();
    writeAudit(actor, "channel.multiplex.create", `${vhost}/${app}/${rest.outputStream.name}`, null);
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
    await getOmeClient().deleteMultiplexChannel(vhost, app, name);
    const actor = await getCurrentUsername();
    writeAudit(actor, "channel.multiplex.delete", `${vhost}/${app}/${name}`, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
