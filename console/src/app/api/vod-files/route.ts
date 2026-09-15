import { NextResponse } from "next/server";
import fs from "node:fs";

// Lists the bind-mounted VOD directory (same host path OME's Schedule
// provider resolves file:// playlist items from) so the add-scheduled-
// channel form's file picker reflects whatever the operator has actually
// copied in. OME's API has no directory-listing endpoint, so this reads the
// filesystem directly rather than round-tripping through OME.
export async function GET() {
  const dir = process.env.VOD_DIR;
  if (!dir) {
    return NextResponse.json({ error: "VOD_DIR is not configured" }, { status: 500 });
  }
  try {
    const files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
