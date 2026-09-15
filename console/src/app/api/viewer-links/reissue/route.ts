import { NextResponse } from "next/server";
import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { signUrl, hmacSha1Key } from "@/lib/signedPolicy";
import type { ViewerLinkRow } from "../route";
import { getCurrentUsername } from "@/auth/currentUser";

// Step 4 of the secret-rotation flow (PRD §6 #8: "treated as a destructive
// action with a re-issue step"): by the time the operator clicks this, they
// have already updated .env + Server.xml and restarted both containers, so
// process.env.SIGNED_POLICY_SECRET here is already the NEW secret — this
// just re-signs every still-relevant link with it and overwrites the stored URL.
function baseUrlFromSigned(url: string): string {
  return url.split("?")[0];
}

export async function POST() {
  const secret = process.env.SIGNED_POLICY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SIGNED_POLICY_SECRET is not configured" }, { status: 500 });
  }

  const links = db
    .prepare(`SELECT * FROM viewer_links WHERE expires_at IS NULL OR expires_at > datetime('now')`)
    .all() as ViewerLinkRow[];

  // Import the HMAC key once — signUrl() otherwise re-imports it per link,
  // and this is exactly the bulk case (rotating dozens/hundreds of links at
  // once) that cost is worth avoiding for. Sign everything first (async),
  // then apply all the writes as one atomic transaction so a mid-batch
  // failure can't leave some links re-signed and others not.
  const key = await hmacSha1Key(secret);
  const updates = await Promise.all(
    links.map(async (link) => {
      const urlExpire = link.expires_at
        ? new Date(link.expires_at).getTime()
        : Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
      const newUrl = await signUrl(baseUrlFromSigned(link.url), { url_expire: urlExpire }, key);
      return { id: link.id, newUrl };
    }),
  );

  const applyAll = db.transaction((rows: typeof updates) => {
    const stmt = db.prepare(`UPDATE viewer_links SET url = ? WHERE id = ?`);
    for (const row of rows) stmt.run(row.newUrl, row.id);
  });
  applyAll(updates);

  writeAudit(await getCurrentUsername(), "signed-policy.reissue", null, { count: links.length });
  return NextResponse.json({ reissued: links.length });
}
