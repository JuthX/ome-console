"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDrawer } from "../_lib/DrawerProvider";
import { useLiveSnapshot } from "../_lib/LiveSnapshotProvider";
import { useCurrentUser } from "../_lib/CurrentUserProvider";
import { hasRole } from "@/auth/roles";
import { formatBitrate, protocolLabel, totalViewers } from "../_lib/format";

interface AppOption {
  vhost: string;
  app: string;
}

export default function StreamsPage() {
  const snapshot = useLiveSnapshot();
  const { openDrawer } = useDrawer();
  const { role } = useCurrentUser();
  // Adding a pull source is Operator-level (/api/streams/pull and the
  // /api/apps lookup it depends on are both Operator-gated in proxy.ts) —
  // a Viewer visiting this otherwise-viewable page shouldn't see the
  // control at all, rather than a 403'd, silently-empty app dropdown.
  const canAddPullSource = hasRole(role, "operator");
  const searchParams = useSearchParams();
  const [apps, setApps] = useState<AppOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppOption | null>(null);
  // Opened directly from the Multiviewer's "Add pull source" link (?addPull=1).
  const [showPullForm, setShowPullForm] = useState(() => searchParams.get("addPull") === "1");
  const [pullName, setPullName] = useState("");
  const [pullUrl, setPullUrl] = useState("");
  const [pullPersistent, setPullPersistent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!canAddPullSource) return;
    fetch("/api/apps", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        setApps(body.apps ?? []);
        if (body.apps?.length) setSelectedApp(body.apps[0]);
      })
      .catch(() => {});
  }, [canAddPullSource]);

  async function handleAddPullSource() {
    if (!selectedApp || !pullName || !pullUrl) return;
    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const res = await fetch("/api/streams/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vhost: selectedApp.vhost,
          app: selectedApp.app,
          name: pullName,
          url: pullUrl,
          persistent: pullPersistent,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Failed to create pull source");
        return;
      }
      setFormSuccess(`Pulling "${pullName}" — it will appear below once connected.`);
      setPullName("");
      setPullUrl("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="row">
        <div className="grow">
          <h1>Streams</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            Live inputs in this application, with their tracks and who is watching. Pull sources (RTSP) are created
            here; everything else appears when a publisher connects.
          </p>
        </div>
        {canAddPullSource && (
          <button className="btn pri" onClick={() => setShowPullForm((v) => !v)}>
            Add pull source
          </button>
        )}
      </div>

      {canAddPullSource && showPullForm && (
        <div className="pane" style={{ marginBottom: 18 }}>
          <div className="grid3">
            {apps.length > 1 && (
              <label className="field">
                App
                <select
                  value={selectedApp ? `${selectedApp.vhost}/${selectedApp.app}` : ""}
                  onChange={(e) => {
                    const found = apps.find((a) => `${a.vhost}/${a.app}` === e.target.value);
                    setSelectedApp(found ?? null);
                  }}
                >
                  {apps.map((a) => (
                    <option key={`${a.vhost}/${a.app}`} value={`${a.vhost}/${a.app}`}>
                      {a.vhost}/{a.app}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              Stream name
              <input value={pullName} onChange={(e) => setPullName(e.target.value)} placeholder="e.g. ptz-wide" />
            </label>
            <label className="field">
              RTSP URL
              <input
                className="mono"
                value={pullUrl}
                onChange={(e) => setPullUrl(e.target.value)}
                placeholder="rtsp://10.0.4.21/stream1"
              />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <label className="row" style={{ gap: 8, color: "var(--ink-2)" }}>
              <span
                className={`sw${pullPersistent ? " on" : ""}`}
                onClick={() => setPullPersistent((v) => !v)}
                role="switch"
                aria-checked={pullPersistent}
              />
              Keep pulling even with no viewers
            </label>
            <span className="grow"></span>
            {formError && <span className="chip warn">{formError}</span>}
            {formSuccess && <span className="chip push">{formSuccess}</span>}
            <button
              className="btn pri"
              onClick={handleAddPullSource}
              disabled={submitting || !selectedApp || !pullName || !pullUrl}
            >
              {submitting ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {!snapshot ? (
        <p className="lead">Connecting…</p>
      ) : snapshot.streams.length === 0 ? (
        <div className="pane">
          <p className="lead" style={{ margin: 0 }}>
            No streams are live right now.
          </p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Stream</th>
              <th>App</th>
              <th>Protocol</th>
              <th>Video</th>
              <th>Bitrate</th>
              <th>Viewers</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.streams.map((stream) => (
              <tr
                key={`${stream.vhost}/${stream.app}/${stream.name}`}
                onClick={() => openDrawer({ vhost: stream.vhost, app: stream.app, name: stream.name })}
                style={{ cursor: "pointer" }}
              >
                <td className="mono">{stream.name}</td>
                <td>
                  {stream.vhost}/{stream.app}
                </td>
                <td>{protocolLabel(stream.sourceType)}</td>
                <td>
                  {stream.video ? `${stream.video.codec} ${stream.video.width}×${stream.video.height}` : "—"}
                  <span className="sub">
                    {stream.audioTracks.length} audio track{stream.audioTracks.length === 1 ? "" : "s"}
                  </span>
                </td>
                <td className="mono">{formatBitrate(stream.bitrateIn)}</td>
                <td className="mono">{totalViewers(stream.connections)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
