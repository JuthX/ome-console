import { NextRequest, NextResponse } from "next/server";
import { listAudit, listAuditActions } from "@/db/audit";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get("action") ?? undefined;
  const actor = searchParams.get("actor") ?? undefined;
  return NextResponse.json({
    rows: listAudit({ action, actor }),
    actions: listAuditActions(),
  });
}
