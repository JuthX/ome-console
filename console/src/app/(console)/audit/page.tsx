"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const POLL_MS = 5000;

interface AuditRow {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
}

export default function AuditPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [actionFilter, setActionFilter] = useState("");
  // Matches actor, target and detail together — a generalization of the
  // original actor-only filter, so a "History" link from a user's row
  // (/audit?q=username) or, in future, any other object this log describes,
  // has one query param that reliably finds it without needing every
  // action's target field to share one exact format.
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAudit() {
      try {
        const params = actionFilter ? `?action=${encodeURIComponent(actionFilter)}` : "";
        const res = await fetch(`/api/audit${params}`, { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load audit log");
          return;
        }
        setError(null);
        setRows(body.rows ?? []);
        setActions(body.actions ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    fetchAudit();
    const id = setInterval(fetchAudit, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [actionFilter]);

  // Search filtering is client-side (over the already-fetched ≤500 rows) —
  // no need for another server round-trip at this scale.
  const visibleRows = search
    ? rows.filter((r) => {
        const needle = search.toLowerCase();
        return (
          r.actor.toLowerCase().includes(needle) ||
          (r.target ?? "").toLowerCase().includes(needle) ||
          (r.detail ?? "").toLowerCase().includes(needle)
        );
      })
    : rows;

  return (
    <>
      <h1>Audit log</h1>
      <p className="lead">
        Every write the console has made — who, what, and when. Most recent 500 entries, refreshed every{" "}
        {POLL_MS / 1000}s.
      </p>

      {error && (
        <div className="pane">
          <span className="chip warn">{error}</span>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field" style={{ flex: 1 }}>
          Search
          <input
            placeholder="actor, target or detail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          Action
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => {
            const isLong = (r.detail?.length ?? 0) > 60;
            const isExpanded = expanded === r.id;
            return (
              <tr key={r.id}>
                <td className="mono">{r.created_at}</td>
                <td className="mono">{r.actor}</td>
                <td>{r.action}</td>
                <td className="mono">{r.target ?? "—"}</td>
                <td className="mono">
                  {r.detail ? (
                    isLong ? (
                      <span style={{ cursor: "pointer" }} onClick={() => setExpanded(isExpanded ? null : r.id)}>
                        {isExpanded ? r.detail : `${r.detail.slice(0, 60)}…`}
                      </span>
                    ) : (
                      r.detail
                    )
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
      {visibleRows.length === 0 && !error && (
        <p className="lead" style={{ marginTop: 12 }}>
          No matching audit entries.
        </p>
      )}
    </>
  );
}
