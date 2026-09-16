import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/notifier";

// Sends a real email through whatever SMTP settings are currently
// configured (saved or not — sendEmail always reads live process.env) —
// the only way to actually know the settings work, matching this project's
// "verify for real" pattern elsewhere (Access settings' "Check engine",
// the setup wizard's live reachability check).
export async function POST(req: NextRequest) {
  const { to } = (await req.json()) ?? {};
  if (!to) {
    return NextResponse.json({ ok: false, error: "a recipient address is required" }, { status: 400 });
  }
  try {
    await sendEmail(to, "OME-Console test email", "This confirms your SMTP settings are working.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
