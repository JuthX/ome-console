import { getOmeClient } from "@/ome-client/client";
import { subscribeToSnapshots } from "@/stats-poller";
import type { LiveSnapshot } from "@/stats-poller/types";
import { db } from "@/db";
import { writeAudit } from "@/db/audit";
import { sendEmail } from "@/lib/notifier";

// Sprint 7b: a small FIXED rule catalog (PRD §8's `alert_routes` only
// tracks *routing*, not rule definitions — no `alert_rules` table exists —
// confirming the product's own design: rules are fixed, only routing is
// operator-configurable). Mirrors the exact globalThis-pinned pattern
// already used twice this session (stats-poller, reconciler).

export type RuleName = "bitrate-high" | "bitrate-low" | "fps-drop" | "push-down" | "server-load";

export const RULES: { name: RuleName; label: string; condition: string }[] = [
  { name: "bitrate-high", label: "Ingress bitrate high", condition: "stream in > 9 Mb/s for 3 min" },
  { name: "bitrate-low", label: "Ingress bitrate low", condition: "stream in < 1 Mb/s for 30 s" },
  { name: "fps-drop", label: "Framerate drop", condition: "video fps < 90% of its own baseline" },
  { name: "push-down", label: "Push target down", condition: "push state ≠ pushing for 20 s" },
  { name: "server-load", label: "Server load", condition: "CPU > 85%" }, // no GPU metric exists on this host
];

const RULE_LABELS: Record<RuleName, string> = Object.fromEntries(RULES.map((r) => [r.name, r.label])) as Record<
  RuleName,
  string
>;

const BITRATE_HIGH = 9_000_000;
const BITRATE_HIGH_MS = 3 * 60_000;
const BITRATE_LOW = 1_000_000;
const BITRATE_LOW_MS = 30_000;
const PUSH_DOWN_MS = 20_000;
const CPU_HIGH_PERCENT = 85;

interface Candidate {
  since: number | null; // ms epoch when the condition became continuously true
  firing: boolean; // already crossed the duration threshold — avoids re-notifying every tick
  displayName: string;
}

interface RuleRuntime {
  candidates: Map<string, Candidate>;
}

interface AlertsState {
  started: boolean;
  rules: Record<RuleName, RuleRuntime>;
  fpsBaseline: Map<string, number>;
  pushEvalErroring: boolean;
}

declare global {
  var __omeAlerts: AlertsState | undefined;
}

function getState(): AlertsState {
  if (!globalThis.__omeAlerts) {
    globalThis.__omeAlerts = {
      started: false,
      rules: Object.fromEntries(RULES.map((r) => [r.name, { candidates: new Map() }])) as Record<
        RuleName,
        RuleRuntime
      >,
      fpsBaseline: new Map(),
      pushEvalErroring: false,
    };
  }
  return globalThis.__omeAlerts;
}

/** Returns "fired" | "resolved" | null and updates the candidate's state. */
function checkCandidate(
  rule: RuleRuntime,
  targetKey: string,
  displayName: string,
  isTrue: boolean,
  durationMs: number,
  now: number,
): "fired" | "resolved" | null {
  let c = rule.candidates.get(targetKey);
  if (!c) {
    c = { since: null, firing: false, displayName };
    rule.candidates.set(targetKey, c);
  }
  c.displayName = displayName;
  if (isTrue) {
    if (c.since === null) c.since = now;
    if (!c.firing && now - c.since >= durationMs) {
      c.firing = true;
      return "fired";
    }
  } else {
    c.since = null;
    if (c.firing) {
      c.firing = false;
      return "resolved";
    }
  }
  return null;
}

async function notify(ruleName: RuleName, displayName: string, transition: "fired" | "resolved") {
  const label = RULE_LABELS[ruleName];
  const verb = transition === "fired" ? "firing" : "resolved";
  writeAudit("alert-evaluator", transition === "fired" ? "alert.fire" : "alert.resolve", displayName, { rule: ruleName });

  const routes = db
    .prepare(`SELECT * FROM alert_routes WHERE rule_name = ? AND enabled = 1`)
    .all(ruleName) as { channel: string; target: string }[];
  for (const route of routes) {
    if (route.channel !== "email") continue; // Slack/SMS: real future channels, not implemented this sprint
    try {
      await sendEmail(
        route.target,
        `[OME-Console] ${label} — ${verb}`,
        `${label} is ${verb} for "${displayName}".`,
      );
    } catch (err) {
      // A notification failure shouldn't crash evaluation — the alert
      // state itself is still tracked correctly and visible in the UI —
      // but it must be observable somewhere, or a broken SMTP config fails
      // silently forever. writeAudit already recorded the fire/resolve
      // itself; this is specifically about the *delivery* attempt.
      console.error(`[alerts] failed to email ${route.target} for ${ruleName}:`, err);
      writeAudit("alert-evaluator", "alert.notify-failed", route.target, { rule: ruleName, error: String(err) });
    }
  }
}

async function evaluateSnapshot(snapshot: LiveSnapshot): Promise<void> {
  const state = getState();
  const now = Date.now();
  const liveKeys = new Set<string>();

  for (const stream of snapshot.streams) {
    const key = `${stream.vhost}/${stream.app}/${stream.name}`;
    liveKeys.add(key);

    const high = checkCandidate(state.rules["bitrate-high"], key, stream.name, stream.bitrateIn > BITRATE_HIGH, BITRATE_HIGH_MS, now);
    if (high) await notify("bitrate-high", stream.name, high);

    const low = checkCandidate(
      state.rules["bitrate-low"],
      key,
      stream.name,
      stream.bitrateIn > 0 && stream.bitrateIn < BITRATE_LOW,
      BITRATE_LOW_MS,
      now,
    );
    if (low) await notify("bitrate-low", stream.name, low);

    if (stream.video && stream.video.framerate > 0) {
      if (!state.fpsBaseline.has(key)) state.fpsBaseline.set(key, stream.video.framerate);
      const baseline = state.fpsBaseline.get(key)!;
      const drop = checkCandidate(
        state.rules["fps-drop"],
        key,
        stream.name,
        stream.video.framerate < baseline * 0.9,
        0,
        now,
      );
      if (drop) await notify("fps-drop", stream.name, drop);
    }
  }

  // Clear stream-scoped candidates/baselines once a stream goes away, so a
  // future reconnect starts with a fresh baseline rather than comparing
  // against a stale one. If it was still firing, resolve it first — a
  // stream just disconnecting is the single most common way a condition
  // stops being true, and silently dropping the candidate here (as an
  // earlier version of this code did) meant the operator was told about
  // every fire but never about the matching resolve.
  for (const ruleName of ["bitrate-high", "bitrate-low", "fps-drop"] as const) {
    for (const [key, candidate] of Array.from(state.rules[ruleName].candidates.entries())) {
      if (!liveKeys.has(key)) {
        if (candidate.firing) {
          await notify(ruleName, candidate.displayName, "resolved");
        }
        state.rules[ruleName].candidates.delete(key);
      }
    }
  }
  for (const key of Array.from(state.fpsBaseline.keys())) {
    if (!liveKeys.has(key)) state.fpsBaseline.delete(key);
  }

  const serverHigh = checkCandidate(
    state.rules["server-load"],
    "server",
    "this server",
    (snapshot.server.cpuLoadPercent ?? 0) > CPU_HIGH_PERCENT,
    0,
    now,
  );
  if (serverHigh) await notify("server-load", "this server", serverHigh);
}

async function evaluatePushTasks(): Promise<void> {
  const state = getState();
  const now = Date.now();
  const client = getOmeClient();
  const seenKeys = new Set<string>();
  try {
    const vhosts = await client.listVhosts();
    for (const vhost of vhosts) {
      const apps = await client.listApps(vhost);
      for (const app of apps) {
        const tasks = await client.listPushes(vhost, app).catch(() => []);
        for (const task of tasks) {
          const key = `${vhost}/${app}/${task.id}`;
          seenKeys.add(key);
          const down = checkCandidate(
            state.rules["push-down"],
            key,
            task.id,
            task.state !== "pushing",
            PUSH_DOWN_MS,
            now,
          );
          if (down) await notify("push-down", task.id, down);
        }
      }
    }
    if (state.pushEvalErroring) {
      console.log("[alerts] push-down evaluation recovered — OME is reachable again.");
      state.pushEvalErroring = false;
    }
  } catch (err) {
    // Transient OME error — try again next tick; don't clean up candidates
    // below, since we don't actually know the real current task list. Log
    // once on the ok->erroring transition (not every 10s tick) so a
    // sustained outage is observable without spamming — matching notify()'s
    // own "must be observable somewhere" rule just above.
    if (!state.pushEvalErroring) {
      console.error("[alerts] push-down evaluation failed, will retry:", err);
      state.pushEvalErroring = true;
    }
    return;
  }

  // Same "resolve before delete" fix as evaluateSnapshot's stream cleanup —
  // an explicitly-stopped push task disappears from listPushes entirely,
  // which must not silently drop a firing alert with no resolve notice.
  for (const [key, candidate] of Array.from(state.rules["push-down"].candidates.entries())) {
    if (!seenKeys.has(key)) {
      if (candidate.firing) {
        await notify("push-down", candidate.displayName, "resolved");
      }
      state.rules["push-down"].candidates.delete(key);
    }
  }
}

export interface RuleStatus {
  name: RuleName;
  label: string;
  condition: string;
  firing: boolean;
  firingTarget: string | null;
}

/** For /api/alerts — current firing state of every rule. */
export function getRuleStatuses(): RuleStatus[] {
  const state = getState();
  return RULES.map((r) => {
    const firingCandidate = Array.from(state.rules[r.name].candidates.values()).find((c) => c.firing);
    return {
      name: r.name,
      label: r.label,
      condition: r.condition,
      firing: !!firingCandidate,
      firingTarget: firingCandidate?.displayName ?? null,
    };
  });
}

const PUSH_POLL_MS = 10_000;

/** Idempotent — safe to call from instrumentation.ts even across hot reloads. */
export function startAlertEvaluator(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  subscribeToSnapshots((snapshot) => {
    evaluateSnapshot(snapshot).catch(() => {});
  });
  evaluatePushTasks().catch(() => {});
  setInterval(() => evaluatePushTasks().catch(() => {}), PUSH_POLL_MS);
}
