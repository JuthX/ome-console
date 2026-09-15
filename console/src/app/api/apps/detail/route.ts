import { NextRequest, NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { omeErrorResponse } from "@/lib/api-error";

// Full app config (providers/publishers/output profiles/dynamic flag) for
// the Hosts & Apps page — the plain /api/apps route only returns {vhost,app} pairs.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const vhost = searchParams.get("vhost");
  const app = searchParams.get("app");
  if (!vhost || !app) {
    return NextResponse.json({ error: "vhost and app are required" }, { status: 400 });
  }
  try {
    const client = getOmeClient();
    const [detail, stats] = await Promise.all([client.getApp(vhost, app), client.getAppStats(vhost, app)]);
    return NextResponse.json({ app: detail, stats });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
