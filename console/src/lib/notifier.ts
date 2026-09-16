import nodemailer from "nodemailer";

// Sprint 7b: email only. Slack/SMS are real future channels the
// `alert_routes` schema already supports (just a `channel` string column) —
// not implemented yet because they need credentials this deployment doesn't
// have configured (a Slack incoming webhook, a Twilio account). Sends
// through this host's own mailcow instance, not a third-party service.

// globalThis-pinned, not a plain module-level `let` — Next.js bundles
// instrumentation.ts and each route handler as separate module graphs even
// within one running process, which already caused two silent bugs in this
// project (the SQLite connection, the poller's state) before both were
// fixed the same way — see console/src/db/index.ts or
// console/src/stats-poller/index.ts for the pattern.
declare global {
  var __consoleSmtpTransporter: ReturnType<typeof nodemailer.createTransport> | undefined;
}

function getTransporter() {
  if (!globalThis.__consoleSmtpTransporter) {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;
    if (!host || !port || !user || !pass) {
      throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD must be set");
    }
    globalThis.__consoleSmtpTransporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465,
      auth: { user, pass },
    });
  }
  return globalThis.__consoleSmtpTransporter;
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const from = process.env.SMTP_FROM;
  if (!from) throw new Error("SMTP_FROM must be set");
  await getTransporter().sendMail({ from, to, subject, text: body });
}

/**
 * Called by /api/smtp after writing new settings — the transporter above is
 * only ever built once and cached, so without this a saved change would
 * silently keep using the old host/credentials until the next full
 * restart. Dropping the cache is enough: getTransporter() reads
 * process.env fresh next time it's called, and the settings route updates
 * process.env in this same running process (not just the .env file) before
 * calling this, so the very next send already uses the new values — no
 * restart required for SMTP specifically, unlike most other settings.
 */
export function clearCachedTransporter(): void {
  globalThis.__consoleSmtpTransporter = undefined;
}
