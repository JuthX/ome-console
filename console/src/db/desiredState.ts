import { db } from "./index";
import { getLatestSnapshot } from "@/stats-poller";
import type { StartPushRequest, StartRecordRequest } from "@/ome-client/types";

// PRD §6 #7: API-created resources aren't guaranteed to survive an OME
// restart — the console holds desired state here and the reconciler
// (src/reconciler) re-applies it. Every push/record task the console starts
// (from /push, /rec, or the add-input wizard) is persisted here on start and
// removed on explicit stop; `config.id` is the same string sent as OME's own
// task `id`, so the reconciler can tell "already running" from "needs
// restarting" by checking whether that id still exists in OME's task list.

interface DesiredRow {
  id: number;
  vhost: string;
  app: string;
  stream_name: string;
  config: string;
  enabled: number;
}

/** A push/record config may carry an optional cosmetic `label` (set by the
 * add-input wizard) alongside the fields OME itself needs. */
export type StoredConfig = (StartPushRequest | StartRecordRequest) & { label?: string };

/** `label` is console-only bookkeeping — never sent to OME (see api/push and api/record's own POST handlers, which strip it the same way before the initial call). */
export function stripLabel<T extends StoredConfig>(config: T): Omit<T, "label"> {
  const withoutLabel = { ...config };
  delete withoutLabel.label;
  return withoutLabel;
}

export function upsertDesiredPush(vhost: string, app: string, streamName: string, config: StoredConfig): void {
  db.prepare(
    `INSERT INTO desired_push_tasks (vhost, app, stream_name, config) VALUES (?, ?, ?, ?)`,
  ).run(vhost, app, streamName, JSON.stringify(config));
}

export function upsertDesiredRecord(vhost: string, app: string, streamName: string, config: StoredConfig): void {
  db.prepare(
    `INSERT INTO desired_record_tasks (vhost, app, stream_name, config) VALUES (?, ?, ?, ?)`,
  ).run(vhost, app, streamName, JSON.stringify(config));
}

function removeDesired(table: "desired_push_tasks" | "desired_record_tasks", vhost: string, app: string, id: string): void {
  const rows = db
    .prepare(`SELECT id, config FROM ${table} WHERE vhost = ? AND app = ? AND enabled = 1`)
    .all(vhost, app) as { id: number; config: string }[];
  for (const row of rows) {
    const config = JSON.parse(row.config) as StoredConfig;
    if (config.id === id) {
      db.prepare(`UPDATE ${table} SET enabled = 0, updated_at = datetime('now') WHERE id = ?`).run(row.id);
    }
  }
}

export function removeDesiredPush(vhost: string, app: string, id: string): void {
  removeDesired("desired_push_tasks", vhost, app, id);
}

export function removeDesiredRecord(vhost: string, app: string, id: string): void {
  removeDesired("desired_record_tasks", vhost, app, id);
}

export function listEnabledDesiredPush(): DesiredRow[] {
  return db.prepare(`SELECT * FROM desired_push_tasks WHERE enabled = 1`).all() as DesiredRow[];
}

export function listEnabledDesiredRecord(): DesiredRow[] {
  return db.prepare(`SELECT * FROM desired_record_tasks WHERE enabled = 1`).all() as DesiredRow[];
}

export interface ReservedStream {
  vhost: string;
  app: string;
  streamName: string;
  label: string | null;
  pushCount: number;
  recordCount: number;
}

/** Desired streams not currently live — what the Wall page renders as "reserved" tiles. */
export function reservedSummary(): ReservedStream[] {
  const snapshot = getLatestSnapshot();
  const liveKeys = new Set(snapshot.streams.map((s) => `${s.vhost}/${s.app}/${s.name}`));

  const groups = new Map<string, ReservedStream>();
  const add = (row: DesiredRow, kind: "push" | "record") => {
    const key = `${row.vhost}/${row.app}/${row.stream_name}`;
    if (liveKeys.has(key)) return;
    const config = JSON.parse(row.config) as StoredConfig;
    const existing = groups.get(key);
    if (existing) {
      if (kind === "push") existing.pushCount++;
      else existing.recordCount++;
      existing.label = existing.label ?? config.label ?? null;
    } else {
      groups.set(key, {
        vhost: row.vhost,
        app: row.app,
        streamName: row.stream_name,
        label: config.label ?? null,
        pushCount: kind === "push" ? 1 : 0,
        recordCount: kind === "record" ? 1 : 0,
      });
    }
  };

  for (const row of listEnabledDesiredPush()) add(row, "push");
  for (const row of listEnabledDesiredRecord()) add(row, "record");

  return Array.from(groups.values());
}
