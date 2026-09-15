import { db } from "./index";

/**
 * Every console-initiated write, from Sprint 4 onward (PRD §8's `audit` table).
 * `actor` is the real logged-in username (Sprint 8a) for request-driven calls,
 * or a fixed system label ("reconciler", "alert-evaluator", "ome") for
 * background/webhook-driven calls that have no session to read.
 */
export function writeAudit(actor: string, action: string, target: string | null, detail: unknown): void {
  db.prepare(`INSERT INTO audit (actor, action, target, detail) VALUES (?, ?, ?, ?)`).run(
    actor,
    action,
    target,
    detail === undefined ? null : JSON.stringify(detail),
  );
}

export interface AuditRow {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
}

/**
 * Sprint 8b: the audit log UI's only read path. Fixed LIMIT rather than
 * real pagination — no list endpoint anywhere in this app paginates, and
 * the real row count (64 after a full day of exercising nearly every write
 * path) is nowhere near where that would matter.
 */
export function listAudit(filter: { action?: string; actor?: string } = {}): AuditRow[] {
  return db
    .prepare(
      `SELECT * FROM audit
       WHERE (@action IS NULL OR action = @action)
         AND (@actor IS NULL OR actor = @actor)
       ORDER BY id DESC LIMIT 500`,
    )
    .all({ action: filter.action ?? null, actor: filter.actor ?? null }) as AuditRow[];
}

export function listAuditActions(): string[] {
  return (db.prepare(`SELECT DISTINCT action FROM audit ORDER BY action`).all() as { action: string }[]).map(
    (r) => r.action,
  );
}
