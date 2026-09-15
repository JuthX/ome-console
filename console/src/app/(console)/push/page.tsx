"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveSnapshot } from "../_lib/LiveSnapshotProvider";
import { useDrawer } from "../_lib/DrawerProvider";
import { outputStreamsFor } from "../_lib/outputStreams";
import { formatBytes, formatDuration } from "../_lib/format";
import { VariantPicker, variantNamesFrom, type VariantSelection } from "../_components/VariantPicker";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import type { PushProtocol, PushTask } from "@/ome-client/types";
import type { PushPreset } from "@/db/types";

const POLL_MS = 5000;
const PROTOCOLS: PushProtocol[] = ["rtmp", "srt", "mpegts"];

interface AppOption {
  vhost: string;
  app: string;
}

function maskKey(key?: string): string {
  if (!key) return "";
  return key.length <= 4 ? key : `…${key.slice(-4)}`;
}

export default function PushPage() {
  const snapshot = useLiveSnapshot();
  const searchParams = useSearchParams();
  const { openDrawer } = useDrawer();
  const [apps, setApps] = useState<AppOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppOption | null>(null);
  const [tasks, setTasks] = useState<PushTask[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [presets, setPresets] = useState<PushPreset[]>([]);

  // Prefilled/opened from the stream drawer's "Start push" link (?stream=...).
  const [showForm, setShowForm] = useState(() => !!searchParams.get("stream"));
  const [name, setName] = useState("");
  const [streamName, setStreamName] = useState(() => searchParams.get("stream") ?? "");
  const [variant, setVariant] = useState<VariantSelection>({ video: null, audio: null });
  const [protocol, setProtocol] = useState<PushProtocol>("rtmp");
  const [url, setUrl] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState<PushTask | null>(null);
  const [confirmDeletePreset, setConfirmDeletePreset] = useState<PushPreset | null>(null);

  // Apps come from OME directly (declared apps, not just ones with a live
  // stream right now) — a push target can be reserved before any publisher
  // connects (PRD §6 #5).
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

  useEffect(() => {
    if (!selectedApp) return;
    let cancelled = false;

    async function fetchTasks() {
      try {
        const res = await fetch(`/api/push?vhost=${selectedApp!.vhost}&app=${selectedApp!.app}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setListError(body.error ?? "Failed to load push targets");
          return;
        }
        setListError(null);
        setTasks(body.pushes ?? []);
      } catch (err) {
        if (!cancelled) setListError(err instanceof Error ? err.message : String(err));
      }
    }

    fetchTasks();
    const id = setInterval(fetchTasks, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedApp]);

  const outputOptions = selectedApp ? outputStreamsFor(snapshot, selectedApp.vhost, selectedApp.app) : [];
  const matchingOutput = outputOptions.find((o) => o.name === streamName);

  async function handleStart() {
    if (!selectedApp) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vhost: selectedApp.vhost,
          app: selectedApp.app,
          id: name,
          stream: { name: streamName, variantNames: variantNamesFrom(variant) },
          protocol,
          url,
          streamKey: streamKey || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Failed to start push");
        return;
      }
      setName("");
      setStreamName("");
      setVariant({ video: null, audio: null });
      setUrl("");
      setStreamKey("");
      setShowForm(false);
      setTasks((prev) => [...prev, body.task]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePreset() {
    if (!name || !url) {
      setFormError("Name and URL are required to save a preset.");
      return;
    }
    try {
      const res = await fetch("/api/push-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, protocol, url_template: url, stream_key: streamKey || null }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Failed to save preset");
        return;
      }
      setPresets((prev) => [body.preset, ...prev]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  }

  function applyPreset(id: string) {
    const preset = presets.find((p) => String(p.id) === id);
    if (!preset) return;
    setName(preset.name);
    setProtocol(preset.protocol as PushProtocol);
    setUrl(preset.url_template);
    setStreamKey(preset.stream_key ?? "");
  }

  async function handleDeletePreset(preset: PushPreset) {
    try {
      await fetch(`/api/push-presets?id=${preset.id}`, { method: "DELETE" });
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    } finally {
      setConfirmDeletePreset(null);
    }
  }

  async function handleStop(task: PushTask) {
    try {
      const res = await fetch("/api/push/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vhost: task.vhost, app: task.app, id: task.id }),
      });
      if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } finally {
      setConfirmStop(null);
    }
  }

  return (
    <>
      <div className="row">
        <div className="grow">
          <h1>Push targets</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            Re-stream any output to RTMP, SRT or MPEG-TS. Pick which video and audio variants go to each target.
            Targets created before the stream exists wait and start automatically.
          </p>
        </div>
      </div>

      {apps.length > 1 && (
        <label className="field" style={{ width: 240, marginBottom: 12 }}>
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

      <h2>Active and queued</h2>
      {listError ? (
        <div className="pane">
          <span className="chip warn">{listError}</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="pane">
          <p className="lead" style={{ margin: 0 }}>
            No push targets yet.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>Stream</th>
              <th>Variants</th>
              <th>Protocol</th>
              <th>Destination</th>
              <th>Sent</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  {task.id}
                  <span className="sub">
                    id {task.id}
                    {task.streamKey ? ` · key ${maskKey(task.streamKey)}` : ""}
                  </span>
                </td>
                <td className="mono">
                  <button
                    className="btn sm"
                    style={{ padding: 0, border: 0, background: "none" }}
                    onClick={() => selectedApp && openDrawer({ vhost: selectedApp.vhost, app: selectedApp.app, name: task.stream.name })}
                  >
                    {task.stream.name}
                  </button>
                </td>
                <td className="mono">
                  {task.stream.variantNames.length ? task.stream.variantNames.join(", ") : "all"}
                </td>
                <td>{task.protocol.toUpperCase()}</td>
                <td>
                  <span className="url">{task.url}</span>
                </td>
                <td className="num">
                  {formatBytes(task.sentBytes)} · {formatDuration(task.sentTime)}
                </td>
                <td>
                  <span
                    className={`chip ${
                      task.state === "pushing" ? "push" : task.state === "ready" ? "reserved" : "warn"
                    }`}
                  >
                    {task.state === "ready" ? "waiting for stream" : task.state}
                  </span>
                </td>
                <td className="acts">
                  <button className="btn sm" onClick={() => setConfirmStop(task)}>
                    {task.state === "ready" ? "Cancel" : "Stop"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}

      <div className="row" style={{ marginTop: 18, marginBottom: 10 }}>
        <span className="grow"></span>
        <button className="btn pri" onClick={() => setShowForm((v) => !v)}>
          New push target
        </button>
      </div>
      {showForm && (
      <div className="pane">
        {presets.length > 0 && (
          <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            <label className="field" style={{ width: 240 }}>
              Load preset
              <select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
                <option value="">— choose a preset —</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {presets.map((p) => (
              <span key={p.id} className="chip" style={{ alignSelf: "flex-end" }}>
                {p.name}
                <button
                  className="btn sm"
                  style={{ padding: "0 4px", marginLeft: 4 }}
                  onClick={() => setConfirmDeletePreset(p)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="grid3">
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. YouTube · DE" />
          </label>
          <label className="field">
            Output stream
            <input
              className="mono"
              list="push-output-streams"
              value={streamName}
              onChange={(e) => setStreamName(e.target.value)}
              placeholder="e.g. vmix-program"
            />
            <datalist id="push-output-streams">
              {outputOptions.map((o) => (
                <option key={o.name} value={o.name} />
              ))}
            </datalist>
            <span style={{ fontSize: 11 }}>The OME output name — same as the input name unless a profile renames it.</span>
          </label>
          <label className="field">
            Protocol
            <select value={protocol} onChange={(e) => setProtocol(e.target.value as PushProtocol)}>
              {PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <VariantPicker tracks={matchingOutput?.tracks ?? []} value={variant} onChange={setVariant} />
          <label className="field">
            URL
            <input
              className="mono"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="rtmp://a.rtmp.youtube.com/live2"
            />
          </label>
          <label className="field">
            Stream key
            <input
              className="mono"
              type="password"
              value={streamKey}
              onChange={(e) => setStreamKey(e.target.value)}
              placeholder="xxxx-xxxx-xxxx"
            />
          </label>
        </div>
        {/* OME always reserves a target and auto-starts it once the stream
            appears (PRD §6 #5) — this toggle is explanatory framing, not a
            separate code path. */}
        <div className="row" style={{ marginTop: 12 }}>
          <label className="row" style={{ gap: 8, color: "var(--ink-2)" }}>
            <span
              className={`sw${autoStart ? " on" : ""}`}
              onClick={() => setAutoStart((v) => !v)}
              role="switch"
              aria-checked={autoStart}
            />
            Start automatically when the stream appears
          </label>
          <span className="grow"></span>
          {formError && <span className="chip warn">{formError}</span>}
          <button className="btn" onClick={handleSavePreset}>
            Save as preset
          </button>
          <button
            className="btn pri"
            onClick={handleStart}
            disabled={submitting || !selectedApp || !name || !streamName || !url}
          >
            {submitting ? "Starting…" : "Start push"}
          </button>
        </div>
      </div>
      )}

      <ConfirmDialog
        open={confirmStop !== null}
        title={confirmStop?.state === "ready" ? "Cancel push target?" : "Stop push?"}
        message={`This will stop pushing "${confirmStop?.stream.name}" to ${confirmStop?.url}.`}
        confirmLabel={confirmStop?.state === "ready" ? "Cancel target" : "Stop push"}
        onConfirm={() => confirmStop && handleStop(confirmStop)}
        onCancel={() => setConfirmStop(null)}
      />

      <ConfirmDialog
        open={confirmDeletePreset !== null}
        title="Delete preset?"
        message={`"${confirmDeletePreset?.name}" will be permanently removed.`}
        confirmLabel="Delete"
        onConfirm={() => confirmDeletePreset && handleDeletePreset(confirmDeletePreset)}
        onCancel={() => setConfirmDeletePreset(null)}
      />
    </>
  );
}
