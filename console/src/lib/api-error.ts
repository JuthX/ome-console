import { NextResponse } from "next/server";
import { OmeApiError } from "@/ome-client/client";

/** Shared error->JSON mapping for the Sprint 4 write routes (push/record). */
export function omeErrorResponse(err: unknown): NextResponse {
  if (err instanceof OmeApiError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}
