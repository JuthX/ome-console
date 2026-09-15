import { NextResponse } from "next/server";
import { reservedSummary } from "@/db/desiredState";

// Streams the console has queued push/record tasks for but that aren't live
// yet — the Wall page renders these as "reserved" tiles (PRD's add-input
// wizard: "Produces a 'reserved' tile on the multiviewer").
export async function GET() {
  return NextResponse.json({ reserved: reservedSummary() });
}
