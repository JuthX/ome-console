// Runs once when the Next.js server starts (Node runtime only — this must
// not run in the Edge runtime, hence the guard).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Warn (not fail — an existing deployment's already-working secrets
    // shouldn't get bricked by a stricter check on upgrade) if any
    // HMAC/session secret looks too short to be a real random value. Only
    // CONSOLE_ENCRYPTION_KEY validates itself today (src/lib/crypto.ts,
    // since it must decode to exactly 32 bytes); the others silently accept
    // anything non-empty. New installs never hit this — the setup wizard
    // generates all of these itself.
    const WEAK_SECRET_VARS = ["CONSOLE_SESSION_SECRET", "SIGNED_POLICY_SECRET", "ADMISSION_WEBHOOK_SECRET"];
    const MIN_SECRET_LENGTH = 24;
    for (const name of WEAK_SECRET_VARS) {
      const value = process.env[name];
      if (value && value.length < MIN_SECRET_LENGTH) {
        console.warn(
          `[startup] ${name} is only ${value.length} characters — this signs/verifies real security-sensitive ` +
            `data and should be a long random value (e.g. \`openssl rand -base64 24\`). The app will still start.`,
        );
      }
    }

    // Opens the SQLite file and applies the schema, so the database exists
    // with all 9 tables before any request arrives.
    await import("./db");

    // Sprint 8a: one-time migration carrying the old single-admin env-var
    // login forward as the first real `users` row — idempotent, only acts
    // while the table is still empty.
    const { seedFirstUserFromEnv } = await import("./db/users");
    seedFirstUserFromEnv();

    // The one background poller that talks to OME (PRD §9) — never started
    // per-request or per-SSE-connection, just once for the process's life.
    const { startPoller } = await import("./stats-poller");
    startPoller();

    // Desired-state reconciler (PRD §9, §6 #7) — re-applies console-created
    // push/record tasks OME may have lost across a restart.
    const { startReconciler } = await import("./reconciler");
    startReconciler();

    // Alert rule evaluator (PRD §7 Tier 3 Alerts) — fixed rule catalog,
    // evaluated against the same snapshot feed everything else already uses.
    const { startAlertEvaluator } = await import("./alerts");
    startAlertEvaluator();
  }
}
