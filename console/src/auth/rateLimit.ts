// Login brute-force protection — globalThis-pinned in-memory tracking (same
// singleton pattern as the stats poller/reconciler/alert evaluator), not a
// database table or Redis: this app runs at single-operator scale, and
// losing the counters on a restart is an acceptable tradeoff for the
// simplicity. Tracked by the raw submitted username (not whether it
// resolves to a real account), so lockout behavior can't be used to
// enumerate which usernames exist.

interface Attempt {
  failures: number;
  lockedUntil: number | null;
}

declare global {
  var __consoleLoginAttempts: Map<string, Attempt> | undefined;
}

const MAX_FAILURES_BEFORE_LOCK = 5;
const BASE_LOCK_MS = 30_000; // 30s
const MAX_LOCK_MS = 15 * 60_000; // 15min cap, escalating from the base by doubling per failure past the threshold
const MAX_TRACKED_USERNAMES = 10_000; // crude memory cap for a sustained mass-attack — see below

function getStore(): Map<string, Attempt> {
  if (!globalThis.__consoleLoginAttempts) {
    globalThis.__consoleLoginAttempts = new Map();
  }
  return globalThis.__consoleLoginAttempts;
}

/** Seconds remaining if this username is currently locked out, else null. */
export function checkLoginLock(username: string): number | null {
  const attempt = getStore().get(username);
  if (!attempt?.lockedUntil) return null;
  const remainingMs = attempt.lockedUntil - Date.now();
  if (remainingMs <= 0) return null;
  return Math.ceil(remainingMs / 1000);
}

export function recordLoginFailure(username: string): void {
  const store = getStore();
  // Crude bound on unbounded growth from many distinct junk usernames —
  // clearing everyone's counters in the rare sustained-attack case that
  // triggers this is an acceptable tradeoff for this app's scale over
  // adding a real LRU/expiry structure.
  if (store.size >= MAX_TRACKED_USERNAMES) store.clear();

  const attempt = store.get(username) ?? { failures: 0, lockedUntil: null };
  attempt.failures += 1;
  if (attempt.failures >= MAX_FAILURES_BEFORE_LOCK) {
    const lockMs = Math.min(BASE_LOCK_MS * 2 ** (attempt.failures - MAX_FAILURES_BEFORE_LOCK), MAX_LOCK_MS);
    attempt.lockedUntil = Date.now() + lockMs;
  }
  store.set(username, attempt);
}

export function recordLoginSuccess(username: string): void {
  getStore().delete(username);
}
