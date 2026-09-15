// Pure process.env reads only (no Node built-ins) — imported from both
// src/proxy.ts (Edge runtime) and the Node-runtime setup API route, same
// reasoning as auth/session.ts using Web Crypto instead of node:crypto.

/**
 * True until the setup wizard's final step writes CONSOLE_SETUP_COMPLETE=true
 * to .env *and* the container has been restarted to pick it up (writing the
 * file alone doesn't change this already-running process's env — that's the
 * whole reason the wizard's last step is a restart-then-check, not instant).
 * CONSOLE_ADMIN_USER short-circuits this for existing deployments that seed
 * their first user the old way and never touch /setup at all.
 */
export function isSetupNeeded(): boolean {
  return process.env.CONSOLE_SETUP_COMPLETE !== "true" && !process.env.CONSOLE_ADMIN_USER;
}
