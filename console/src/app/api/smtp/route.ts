import { NextRequest, NextResponse } from "next/server";
import { readEnvFile, writeEnvValues } from "@/lib/envFile";
import { clearCachedTransporter } from "@/lib/notifier";
import { writeAudit } from "@/db/audit";
import { getCurrentUsername } from "@/auth/currentUser";

// Engineer-only (enforced in proxy.ts) — the only place to configure SMTP
// after initial setup; the setup wizard's own SMTP step (api/setup/route.ts)
// only ever runs once, before CONSOLE_SETUP_COMPLETE is written, and is
// skippable, so this is the only way to add or change it afterward.

export async function GET() {
  const env = readEnvFile();
  return NextResponse.json({
    host: env.SMTP_HOST ?? "",
    port: env.SMTP_PORT ?? "587",
    user: env.SMTP_USER ?? "",
    from: env.SMTP_FROM ?? "",
    // Never send the real password to the browser — just whether one is
    // already on file, so the form can say so without asking the operator
    // to retype it on every unrelated change.
    passwordSet: !!env.SMTP_PASSWORD,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { host, port, user, password, from } = body ?? {};
  if (!host || !port || !user || !from) {
    return NextResponse.json({ error: "host, port, username and from address are required" }, { status: 400 });
  }

  const values: Record<string, string> = {
    SMTP_HOST: host,
    SMTP_PORT: String(port),
    SMTP_USER: user,
    SMTP_FROM: from,
  };
  // A blank password means "keep the existing one" — writeEnvValues leaves
  // any key it isn't given untouched, so simply omitting it here is enough;
  // never overwrite a real saved password with an empty string just because
  // the (never-returned) field was blank on this particular save.
  if (password) values.SMTP_PASSWORD = password;

  writeEnvValues(values);

  // Apply immediately, not just on next restart: update this running
  // process's own env (writeEnvValues only touched the file) and drop the
  // cached transporter so the very next send rebuilds it from the new
  // values. Every other setup-wizard-managed setting needs a real restart
  // because it's captured in a module-level const at import time; SMTP's
  // transporter is lazily built on first send, so it doesn't have that
  // constraint.
  Object.assign(process.env, values);
  clearCachedTransporter();

  writeAudit(await getCurrentUsername(), "smtp.update", null, { host, port, user, from });
  return NextResponse.json({ ok: true });
}
