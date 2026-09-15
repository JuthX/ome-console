"use client";

import { useEffect, useRef, useState } from "react";

const POLL_MS = 3000;

function levelClass(line: string): string {
  const match = line.match(/^\[[^\]]+\]\s+([A-Z])\s/);
  switch (match?.[1]) {
    case "E":
    case "C":
      return "e";
    case "W":
      return "w";
    default:
      return "i";
  }
}

export default function LogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      try {
        const res = await fetch(`/api/logs?filter=${encodeURIComponent(filter)}`, { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load logs");
          return;
        }
        setError(null);
        setLines(body.lines);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    fetchLogs();
    const id = setInterval(fetchLogs, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [filter]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  return (
    <>
      <h1>Logs</h1>
      <p className="lead">Tail of the engine log, refreshed every {POLL_MS / 1000}s.</p>

      <div className="row" style={{ marginBottom: "12px" }}>
        <label className="field" style={{ flex: 1 }}>
          Filter
          <input placeholder="e.g. a stream name" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      </div>

      {error ? (
        <div className="pane">
          <span className="chip warn">{error}</span>
        </div>
      ) : (
        <div className="logs" ref={logRef}>
          {lines.length === 0 ? (
            <div className="i">No matching log lines.</div>
          ) : (
            lines.map((line, i) => (
              // A "line" may actually be a multi-line entry (e.g. OME's HTTP
              // debug dumps) grouped server-side — pre-wrap so embedded
              // newlines render as real line breaks instead of collapsing.
              <div key={i} className={levelClass(line)} style={{ whiteSpace: "pre-wrap" }}>
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </>
  );
}
