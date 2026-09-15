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
}

declare global {
  var __omeReconciler: ReconcilerState | undefined;
}

function getState(): ReconcilerState {
  if (!globalThis.__omeReconciler) {
    globalThis.__omeReconciler = { started: false, lastApiOk: false };
  }
  return globalThis.__omeReconciler;
}

async function reconcileOnce(): Promise<void> {
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
          if (!actualIds.has(config.id)) {
            try {
              await client.startPush(vhost, app, config as StartPushRequest);
              writeAudit("reconciler", "reconcile.push-restart", `${vhost}/${app}/${row.stream_name}`, { id: config.id });
            } catch {
              // Will retry next cycle — a transient OME error shouldn't crash the reconciler.
            }
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
          if (!actualIds.has(config.id)) {
            try {
              await client.startRecord(vhost, app, config as StartRecordRequest);
              writeAudit("reconciler", "reconcile.record-restart", `${vhost}/${app}/${row.stream_name}`, { id: config.id });
            } catch {
              // Will retry next cycle.
            }
          }
        }
      }
    }
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
