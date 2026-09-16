import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { countUsers, createUser } from "@/db/users";
import { readEnvFile, writeEnvValues } from "@/lib/envFile";
import { isSetupNeeded } from "@/lib/setupStatus";

// First-run setup wizard (see /setup). proxy.ts already gates this route
// (only reachable at all while isSetupNeeded() is true, GET excepted so the
// wizard's final "restart, then check" step can poll it) — the same check
// is repeated here as defense in depth, the same pattern src/app/api/servers/
// test/route.ts uses for its SSRF check rather than trusting the outer layer
// alone.

// Same charset for both — written verbatim into Server.xml's
// ${env:VAR:default} substitution (no XML escaping happens there) and used
// as a URL path segment elsewhere in the app, so anything outside this set
// (a stray <, &, or ", or a space) could produce invalid XML and stop OME
// booting on the next restart, or a broken stream URL.
const VHOST_APP_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function GET() {
  const env = readEnvFile();
  return NextResponse.json({
    needed: isSetupNeeded(),
    hasAccount: countUsers() > 0,
    // Lets the wizard resume at the right step after a refresh instead of
    // always restarting at "account" — each step is idempotent server-side
    // regardless, this is purely about not repeating already-done steps.
    hasOmeConfig: !!env.OME_ACCESS_TOKEN,
    hasSecrets: !!env.CONSOLE_SESSION_SECRET,
  });
}

export async function POST(req: NextRequest) {
  if (!isSetupNeeded()) {
    return NextResponse.json({ error: "setup already complete" }, { status: 403 });
  }

  const body = await req.json();
  const { step } = body ?? {};

  switch (step) {
    case "account": {
      const { username, password } = body;
      if (!username || typeof password !== "string" || password.length < 8) {
        return NextResponse.json(
          { error: "username and a password of at least 8 characters are required" },
          { status: 400 },
        );
      }
      if (countUsers() > 0) {
        // Wizard was already used to create the first account (e.g. the
        // operator navigated back) — not an error, just nothing to do.
        return NextResponse.json({ ok: true, alreadyDone: true });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      try {
        createUser(username, passwordHash, "engineer");
      } catch {
        return NextResponse.json({ error: "that username is already taken" }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    case "ome": {
      const { hostIp, accessToken, vhost, app } = body;
      // hostIp is deliberately NOT required — blank is genuinely fine, it
      // just means WebRTC ICE candidates won't resolve correctly for
      // off-host viewers until it's set for real (confirmed elsewhere in
      // this app); no reason to block local-only testing over it.
      const finalVhost = vhost || "default";
      const finalApp = app || "app";
      if (!VHOST_APP_PATTERN.test(finalVhost) || !VHOST_APP_PATTERN.test(finalApp)) {
        return NextResponse.json(
          { error: "vhost/app names can only contain letters, numbers, hyphens and underscores" },
          { status: 400 },
        );
      }
      const token = accessToken || randomBytes(32).toString("hex");
      writeEnvValues({
        OME_HOST_IP: hostIp || "",
        OME_ACCESS_TOKEN: token,
        OME_DEFAULT_VHOST: finalVhost,
        OME_DEFAULT_APP: finalApp,
      });
      return NextResponse.json({ ok: true, accessToken: token });
    }

    case "secrets": {
      writeEnvValues({
        CONSOLE_SESSION_SECRET: randomBytes(32).toString("base64"),
        SIGNED_POLICY_SECRET: randomBytes(24).toString("base64"),
        ADMISSION_WEBHOOK_SECRET: randomBytes(24).toString("base64"),
        CONSOLE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      });
      return NextResponse.json({ ok: true });
    }

    case "smtp": {
      const { host, port, user, password, from } = body;
      if (!host) {
        // Explicitly skippable (PRD: alerts just won't email until set later).
        return NextResponse.json({ ok: true, skipped: true });
      }
      writeEnvValues({
        SMTP_HOST: host,
        SMTP_PORT: String(port || 587),
        SMTP_USER: user || "",
        SMTP_PASSWORD: password || "",
        SMTP_FROM: from || "",
      });
      return NextResponse.json({ ok: true });
    }

    case "finish": {
      // Last write, on purpose: everything above only takes effect once the
      // container is restarted anyway, and gating on this single flag (not
      // e.g. "users table has a row") keeps every earlier step re-visitable
      // without the wizard locking itself out partway through.
      writeEnvValues({ CONSOLE_SETUP_COMPLETE: "true" });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "unknown step" }, { status: 400 });
  }
}
