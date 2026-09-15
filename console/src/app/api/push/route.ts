import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import type { StartPushRequest } from "@/ome-client/types";
import { writeAudit } from "@/db/audit";
import { upsertDesiredPush } from "@/db/desiredState";
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
    const pushes = await getOmeClient().listPushes(vhost, app);
    return NextResponse.json({ pushes });
  } catch (err) {
    return omeErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // `label` (set by the add-input wizard, PRD's "Label on multiviewer") is
  // console-only bookkeeping — stripped before the request reaches OME's
  // API, kept in the persisted desired-state config for the Wall page's
  // reserved-tile subtitle.
  const { vhost, app, label, ...rest } = body ?? {};
  if (!vhost || !app || !rest.id || !rest.stream?.name || !rest.protocol || !rest.url) {
    return NextResponse.json(
      { error: "vhost, app, id, stream.name, protocol and url are required" },
      { status: 400 },
    );
  }
  try {
    const task = await getOmeClient().startPush(vhost, app, rest as StartPushRequest);
    // PRD §6 #7: persist so a later OME restart can be reconciled back to
    // this state (src/reconciler) — every console-initiated push, not just
    // ones from the add-input wizard.
    upsertDesiredPush(vhost, app, rest.stream.name, { ...(rest as StartPushRequest), label });
    const actor = await getCurrentUsername();
    writeAudit(actor, "push.start", `${vhost}/${app}/${rest.stream.name}`, {
      id: rest.id,
      protocol: rest.protocol,
      url: rest.url,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
