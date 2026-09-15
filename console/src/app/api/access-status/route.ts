import { NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import { db } from "@/db";
import { omeErrorResponse } from "@/lib/api-error";

const VHOST = process.env.OME_DEFAULT_VHOST ?? "default";
const FIVE_MIN_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    const vhost = await getOmeClient().getVhost(VHOST);
    const since = new Date(Date.now() - FIVE_MIN_MS).toISOString().replace("T", " ").slice(0, 19);
    const counts = db
      .prepare(
        `SELECT action, COUNT(*) as n FROM audit WHERE action IN ('admission.allow','admission.deny') AND created_at >= ? GROUP BY action`,
      )
      .all(since) as { action: string; n: number }[];
    const allowed = counts.find((c) => c.action === "admission.allow")?.n ?? 0;
    const denied = counts.find((c) => c.action === "admission.deny")?.n ?? 0;

    // The UI only ever renders a masked placeholder for these — never send
    // the real secrets to the browser at all (found during Sprint 8a review).
    const safeVhost = structuredClone(vhost) as typeof vhost;
    if (safeVhost.signedPolicy?.secretKey !== undefined) {
      safeVhost.signedPolicy.secretKey = "[redacted]";
    }
    if (safeVhost.admissionWebhooks?.secretKey !== undefined) {
      safeVhost.admissionWebhooks.secretKey = "[redacted]";
    }

    return NextResponse.json({ vhost: safeVhost, admission: { allowed, denied } });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
