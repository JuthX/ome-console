import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import type { AlertRouteRow } from "../alerts/route";
import { getCurrentUsername } from "@/auth/currentUser";

// Only "email" is a real, working channel this sprint (see src/lib/notifier.ts)
// — Slack/SMS are real future additions the schema already supports.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { rule_name, channel, target } = body ?? {};
  if (!rule_name || !channel || !target) {
    return NextResponse.json({ error: "rule_name, channel and target are required" }, { status: 400 });
  }
  if (channel !== "email") {
    return NextResponse.json({ error: "only the email channel is supported so far" }, { status: 400 });
  }
  const result = db
    .prepare(`INSERT INTO alert_routes (rule_name, channel, target) VALUES (?, ?, ?)`)
    .run(rule_name, channel, target);
  const route = db.prepare(`SELECT * FROM alert_routes WHERE id = ?`).get(result.lastInsertRowid) as AlertRouteRow;
  writeAudit(await getCurrentUsername(), "alert-route.create", `${rule_name}/${channel}`, { target });
  return NextResponse.json({ route }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  db.prepare(`DELETE FROM alert_routes WHERE id = ?`).run(id);
  writeAudit(await getCurrentUsername(), "alert-route.delete", id, null);
  return NextResponse.json({ ok: true });
}
