import { getOmeClient } from "@/ome-client/client";
import type { StartPushRequest, StartRecordRequest } from "@/ome-client/types";
import { listEnabledDesiredPush, listEnabledDesiredRecord, stripLabel, type StoredConfig } from "@/db/desiredState";
import { writeAudit } from "@/db/audit";
import { subscribeToSnapshots } from "@/stats-poller";

// PRD §9: "Desired-state reconciler (on boot, on OME reconnect, every 30s)".
// Same globalThis-pin rationale as src/stats-poller/index.ts — instrumentation.ts
// and any route handler importing this module must resolve to one shared
// instance, or the "started" guard silently splits into disconnected copies.
const RECONCILE_INTERVAL_MS = 30_000;

interface ReconcilerState {
  started: boolean;
  lastApiOk: boolean;
  // Per-task ("push:vhost/app/stream" or "record:vhost/app/stream") flag for
  // whether its last reconcile attempt failed — lets a failure be logged
  // once on the ok->erroring transition (matching src/alerts/index.ts's
  // pushEvalErroring pattern) instead of every 30s retry forever with zero
  // signal, which is what happened before (only success wrote an audit row).
  erroring: Map<string, boolean>;
}

declare global {
  var __omeReconciler: ReconcilerState | undefined;
}

function getState(): ReconcilerState {
  if (!globalThis.__omeReconciler) {
    globalThis.__omeReconciler = { started: false, lastApiOk: false, erroring: new Map() };
  }
  return globalThis.__omeReconciler;
}

/** Logs once on the ok->erroring transition, matching alerts/index.ts's pushEvalErroring pattern. */
function markErroring(state: ReconcilerState, key: string, kind: "push" | "record", label: string, err: unknown): void {
  if (state.erroring.get(key)) return;
  state.erroring.set(key, true);
  console.error(`[reconciler] failed to restart ${kind} ${label}, will retry next cycle:`, err);
}

/** Logs once on recovery, if this task was previously erroring. */
function markRecovered(state: ReconcilerState, key: string, kind: "push" | "record", label: string): void {
  if (!state.erroring.get(key)) return;
  state.erroring.delete(key);
  console.log(`[reconciler] ${kind} ${label} recovered.`);
}

async function reconcileOnce(): Promise<void> {
  const state = getState();
  const client = getOmeClient();
  const pushRows = listEnabledDesiredPush();
  const recordRows = listEnabledDesiredRecord();

  const apps = new Set<string>();
  for (const row of [...pushRows, ...recordRows]) apps.add(`${row.vhost}/${row.app}`);

  for (const key of apps) {
    const [vhost, app] = key.split("/");

    const pushesForApp = pushRows.filter((r) => r.vhost === vhost && r.app === app);
    if (pushesForApp.length > 0) {
      const actual = await client.listPushes(vhost, app).catch(() => null);
      if (actual) {
        const actualIds = new Set(actual.map((p) => p.id));
        for (const row of pushesForApp) {
          const config = stripLabel(JSON.parse(row.config) as StoredConfig);
          const label = `${vhost}/${app}/${row.stream_name}`;
          const errKey = `push:${label}`;
          if (!actualIds.has(config.id)) {
            try {
              await client.startPush(vhost, app, config as StartPushRequest);
              writeAudit("reconciler", "reconcile.push-restart", label, { id: config.id });
              markRecovered(state, errKey, "push", label);
            } catch (err) {
              // A transient OME error shouldn't crash the reconciler — will retry next cycle.
              markErroring(state, errKey, "push", label, err);
            }
          } else {
            markRecovered(state, errKey, "push", label);
          }
        }
      }
    }

    const recordsForApp = recordRows.filter((r) => r.vhost === vhost && r.app === app);
    if (recordsForApp.length > 0) {
      const actual = await client.listRecords(vhost, app).catch(() => null);
      if (actual) {
        const actualIds = new Set(actual.map((r) => r.id));
        for (const row of recordsForApp) {
          const config = stripLabel(JSON.parse(row.config) as StoredConfig);
          const label = `${vhost}/${app}/${row.stream_name}`;
          const errKey = `record:${label}`;
          if (!actualIds.has(config.id)) {
            try {
              await client.startRecord(vhost, app, config as StartRecordRequest);
              writeAudit("reconciler", "reconcile.record-restart", label, { id: config.id });
              markRecovered(state, errKey, "record", label);
            } catch (err) {
              markErroring(state, errKey, "record", label, err);
            }
          } else {
            markRecovered(state, errKey, "record", label);
          }
        }
      }
    }
  }

  // Drop erroring entries for tasks that are no longer desired (deleted or
  // disabled) — otherwise this map only ever grows over the app's lifetime.
  const desiredKeys = new Set<string>();
  for (const row of pushRows) desiredKeys.add(`push:${row.vhost}/${row.app}/${row.stream_name}`);
  for (const row of recordRows) desiredKeys.add(`record:${row.vhost}/${row.app}/${row.stream_name}`);
  for (const key of state.erroring.keys()) {
    if (!desiredKeys.has(key)) state.erroring.delete(key);
  }
}

/** Idempotent — safe to call from instrumentation.ts even across hot reloads. */
export function startReconciler(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;

  reconcileOnce().catch(() => {}); // on boot
  setInterval(() => reconcileOnce().catch(() => {}), RECONCILE_INTERVAL_MS); // every 30s

  // on OME reconnect: the poller's own apiOk flag already tracks this every
  // 3s (src/stats-poller) — reuse its snapshot feed instead of polling again.
  subscribeToSnapshots((snapshot) => {
    if (snapshot.server.apiOk && !state.lastApiOk) {
      reconcileOnce().catch(() => {});
    }
    state.lastApiOk = snapshot.server.apiOk;
  });
}
