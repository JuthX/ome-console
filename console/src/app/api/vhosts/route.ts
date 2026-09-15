import { NextResponse } from "next/server";
import { getOmeClient } from "@/ome-client/client";
import type { VhostInfo } from "@/ome-client/types";
import { omeErrorResponse } from "@/lib/api-error";

export type VhostSummary = VhostInfo & { apps: string[] };

export async function GET() {
  try {
    const client = getOmeClient();
    const names = await client.listVhosts();
    const vhosts: VhostSummary[] = await Promise.all(
      names.map(async (name) => {
        const [detail, apps] = await Promise.all([client.getVhost(name), client.listApps(name)]);
        return { ...detail, apps };
      }),
    );
    return NextResponse.json({ vhosts });
  } catch (err) {
    return omeErrorResponse(err);
  }
}
