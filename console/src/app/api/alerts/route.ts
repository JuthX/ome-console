import { NextResponse } from "next/server";
import { getRuleStatuses } from "@/alerts";
import { db } from "@/db";
import { getCurrentUser } from "@/auth/currentUser";
import { hasRole } from "@/auth/roles";

export interface AlertRouteRow {
  id: number;
  rule_name: string;
  channel: string;
  target: string;
  enabled: number;
  created_at: string;
}

export async function GET() {
  const routes = db.prepare(`SELECT * FROM alert_routes ORDER BY created_at DESC`).all() as AlertRouteRow[];
  // Rule firing state is Viewer-visible (it's part of /stats), but managing
  // *where* alerts go is Engineer-only (/api/alert-routes) — don't let a
  // lower role read out notification-target email addresses just because
  // they can see whether a rule is firing.
  const user = await getCurrentUser();
  const canSeeTargets = user ? hasRole(user.role, "engineer") : false;
  const rules = getRuleStatuses().map((rule) => ({
    ...rule,
    routes: routes
      .filter((r) => r.rule_name === rule.name)
      .map((r) => (canSeeTargets ? r : { ...r, target: "" })),
  }));
  return NextResponse.json({ rules });
}
