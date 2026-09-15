"use client";

import { useEffect, useState } from "react";
import type { PushProtocol } from "@/ome-client/types";
import type { PushPreset } from "@/db/types";

interface AppOption {
  vhost: string;
  app: string;
}

type Source = "srt" | "rtmp";

export default function AddInputPage() {
  const [apps, setApps] = useState<AppOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppOption | null>(null);
  const [streamName, setStreamName] = useState("");
  const [source, setSource] = useState<Source>("srt");
  const [assignedTo, setAssignedTo] = useState("");

  const [recordEnabled, setRecordEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [presets, setPresets] = useState<PushPreset[]>([]);
  const [pushProtocol, setPushProtocol] = useState<PushProtocol>("rtmp");
  const [pushUrl, setPushUrl] = useState("");
  const [pushStreamKey, setPushStreamKey] = useState("");

  // Keyed by vhost/app/stream so a stale response for a since-changed field
  // never renders — checked at render time instead of resetting state
  // synchronously in the effect below (react-hooks/set-state-in-effect).
  const [ingestInfo, setIngestInfo] = useState<{ key: string; srtUrl: string; rtmpUrl: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/apps", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        setApps(body.apps ?? []);
        if (body.apps?.length) setSelectedApp(body.apps[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/push-presets", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setPresets(body.presets ?? []))
      .catch(() => {});
  }, []);

  const ingestKey = selectedApp && streamName ? `${selectedApp.vhost}/${selectedApp.app}/${streamName}` : null;

  useEffect(() => {
    if (!selectedApp || !streamName) return;
    const key = `${selectedApp.vhost}/${selectedApp.app}/${streamName}`;
    let cancelled = false;
    fetch(`/api/ingest-info?vhost=${selectedApp.vhost}&app=${selectedApp.app}&stream=${encodeURIComponent(streamName)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled && body.srtUrl) setIngestInfo({ key, srtUrl: body.srtUrl, rtmpUrl: body.rtmpUrl });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedApp, streamName]);

  function applyPreset(id: string) {
    const preset = presets.find((p) => String(p.id) === id);
    if (!preset) return;
    setPushProtocol(preset.protocol as PushProtocol);
    setPushUrl(preset.url_template);
    setPushStreamKey(preset.stream_key ?? "");
  }

  async function handleCreate() {
    if (!selectedApp || !streamName) return;
    setSubmitting(true);
    setFormError(null);
    try {
      // Nothing to persist if neither toggle is on — the connection info
      // above is a pure function of the form fields, already visible
      // without a network call. Still show the "Done" confirmation, since
      // handing out the connection string is itself the point of the wizard.
      if (recordEnabled) {
        const res = await fetch("/api/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vhost: selectedApp.vhost,
            app: selectedApp.app,
            id: `${streamName}-record`,
            stream: { name: streamName, variantNames: [] },
            label: assignedTo || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setFormError(body.error ?? "Failed to queue recording");
          return;
        }
      }
      if (pushEnabled) {
        if (!pushUrl) {
          setFormError("A push URL is required when Push is enabled.");
          return;
        }
        const res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vhost: selectedApp.vhost,
            app: selectedApp.app,
            id: `${streamName}-push`,
            stream: { name: streamName, variantNames: [] },
            protocol: pushProtocol,
            url: pushUrl,
            streamKey: pushStreamKey || undefined,
            label: assignedTo || undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setFormError(body.error ?? "Failed to queue push");
          return;
        }
      }
      setDone(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setStreamName("");
    setAssignedTo("");
    setRecordEnabled(true);
    setPushEnabled(false);
    setPushUrl("");
    setPushStreamKey("");
    setDone(false);
  }

  const ingestUrl =
    ingestInfo && ingestInfo.key === ingestKey ? (source === "srt" ? ingestInfo.srtUrl : ingestInfo.rtmpUrl) : null;

  return (
    <>
      <h1>Add input</h1>
      <p className="lead">
        Name the stream and queue what should happen the moment the source connects. Push and record tasks are
        reserved in the engine and start on their own. This hands out a plain, shared ingest URL — for a revocable,
        per-device key instead (recommended for anything beyond a quick one-off), use{" "}
        <a href="/access">Publish keys &amp; links</a>.
      </p>

      <div className="pane">
        {done ? (
          <>
            <p className="lead" style={{ margin: 0 }}>
              <b>{streamName}</b> is set up. Give the crew this URL:
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="url mono" style={{ maxWidth: 520 }}>
                {ingestUrl}
              </span>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn pri" onClick={handleReset}>
                Add another input
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid3">
              {apps.length > 1 && (
                <label className="field">
                  Application
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
                <input
                  className="mono"
                  value={streamName}
                  onChange={(e) => setStreamName(e.target.value)}
                  placeholder="e.g. phone4"
                />
              </label>
              <label className="field">
                Source
                <select value={source} onChange={(e) => setSource(e.target.value as Source)}>
                  <option value="srt">SRT (caller pushes in)</option>
                  <option value="rtmp">RTMP (encoder pushes in)</option>
                </select>
              </label>
              <label className="field">
                Assigned to
                <input
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="e.g. Spare phone 2"
                />
              </label>
            </div>

            <h2 style={{ marginTop: 18 }}>On connect</h2>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 12px", alignItems: "center", fontSize: 13 }}>
              <span
                className={`sw${recordEnabled ? " on" : ""}`}
                onClick={() => setRecordEnabled((v) => !v)}
                role="switch"
                aria-checked={recordEnabled}
              />
              <span>Record — all tracks, single continuous file</span>
              <span
                className={`sw${pushEnabled ? " on" : ""}`}
                onClick={() => setPushEnabled((v) => !v)}
                role="switch"
                aria-checked={pushEnabled}
              />
              <span>
                Push
                {pushEnabled && (
                  <span className="row" style={{ display: "inline-flex", gap: 8, marginLeft: 10 }}>
                    {presets.length > 0 && (
                      <select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
                        <option value="">— preset —</option>
                        {presets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <select value={pushProtocol} onChange={(e) => setPushProtocol(e.target.value as PushProtocol)}>
                      <option value="rtmp">RTMP</option>
                      <option value="srt">SRT</option>
                      <option value="mpegts">MPEG-TS</option>
                    </select>
                    <input
                      className="mono"
                      style={{ width: 220 }}
                      value={pushUrl}
                      onChange={(e) => setPushUrl(e.target.value)}
                      placeholder="rtmp://a.rtmp.youtube.com/live2"
                    />
                    <input
                      className="mono"
                      type="password"
                      style={{ width: 140 }}
                      value={pushStreamKey}
                      onChange={(e) => setPushStreamKey(e.target.value)}
                      placeholder="stream key"
                    />
                  </span>
                )}
              </span>
            </div>

            {ingestUrl && (
              <div className="row" style={{ marginTop: 16 }}>
                <span className="lead" style={{ margin: 0, fontSize: 13 }}>
                  Link: <span className="url mono">{ingestUrl}</span>
                </span>
              </div>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <span className="grow"></span>
              {formError && <span className="chip warn">{formError}</span>}
              <button
                className="btn pri"
                onClick={handleCreate}
                disabled={submitting || !selectedApp || !streamName}
              >
                {submitting ? "Creating…" : "Create input"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
