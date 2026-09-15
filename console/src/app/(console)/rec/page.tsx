"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveSnapshot } from "../_lib/LiveSnapshotProvider";
import { outputStreamsFor } from "../_lib/outputStreams";
import { VariantPicker, variantNamesFrom, type VariantSelection } from "../_components/VariantPicker";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import { formatBytes, formatDuration } from "../_lib/format";
import type { RecordTask } from "@/ome-client/types";

const POLL_MS = 5000;
const DEFAULT_FILE_PATH = "/${VirtualHost}/${Application}/${Stream}/${StartTime:YYYYMMDDhhmmss}_${EndTime:YYYYMMDDhhmmss}.ts";

type Segmentation = "single" | "interval" | "schedule";

interface AppOption {
  vhost: string;
  app: string;
}

function segmentsLabel(task: RecordTask): string {
  if (task.interval) return `every ${Math.round(task.interval / 60000)} min`;
  if (task.schedule) return `schedule: ${task.schedule}`;
  return "single file";
}

function stateChipClass(state: RecordTask["state"]): string {
  switch (state) {
    case "recording":
      return "rec";
    case "ready":
      return "reserved";
    case "stopped":
      return "off";
    default:
      return "warn";
  }
}

export default function RecordingPage() {
  const snapshot = useLiveSnapshot();
  const searchParams = useSearchParams();
  const [apps, setApps] = useState<AppOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppOption | null>(null);
  const [tasks, setTasks] = useState<RecordTask[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  // Prefilled/opened from the stream drawer's "Start recording" link (?stream=...).
  const [showForm, setShowForm] = useState(() => !!searchParams.get("stream"));
  const [name, setName] = useState("");
  const [streamName, setStreamName] = useState(() => searchParams.get("stream") ?? "");
  const [variant, setVariant] = useState<VariantSelection>({ video: null, audio: null });
  const [segmentation, setSegmentation] = useState<Segmentation>("interval");
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [schedule, setSchedule] = useState("0 */1 *");
  const [filePath, setFilePath] = useState(DEFAULT_FILE_PATH);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState<RecordTask | null>(null);

  // Sprint 4b: HLS dump/conclude for LLHLS streams — no OME endpoint lists
  // active dumps, so "is a dump running" is tracked client-side only and
  // resets on page reload.
  const [hlsStreamName, setHlsStreamName] = useState("");
  const [hlsDumpId, setHlsDumpId] = useState<string | null>(null);
  const [hlsBusy, setHlsBusy] = useState(false);
  const [hlsError, setHlsError] = useState<string | null>(null);
  const [hlsMessage, setHlsMessage] = useState<string | null>(null);

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
    if (!selectedApp) return;
    let cancelled = false;

    async function fetchTasks() {
      try {
        const res = await fetch(`/api/record?vhost=${selectedApp!.vhost}&app=${selectedApp!.app}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setListError(body.error ?? "Failed to load recordings");
          return;
        }
        setListError(null);
        setTasks(body.records ?? []);
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
  // Defaults to the first live output stream until the operator picks one
  // explicitly — computed at render time instead of a setState-in-effect.
  const selectedHlsStream = hlsStreamName || outputOptions[0]?.name || "";

  async function handleStart() {
    if (!selectedApp) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const infoPath = filePath.replace(/\.(ts|mp4)$/i, ".xml");
      const res = await fetch("/api/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vhost: selectedApp.vhost,
          app: selectedApp.app,
          id: name,
          stream: { name: streamName, variantNames: variantNamesFrom(variant) },
          interval: segmentation === "interval" ? intervalMinutes * 60000 : undefined,
          schedule: segmentation === "schedule" ? schedule : undefined,
          filePath,
          infoPath,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Failed to start recording");
        return;
      }
      setName("");
      setStreamName("");
      setVariant({ video: null, audio: null });
      setShowForm(false);
      setTasks((prev) => [...prev, body.task]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStop(task: RecordTask) {
    try {
      const res = await fetch("/api/record/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vhost: task.vhost, app: task.app, id: task.id }),
      });
      if (res.ok) setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } finally {
      setConfirmStop(null);
    }
  }

  async function handleToggleHlsDump() {
    if (!selectedApp || !selectedHlsStream) return;
    setHlsBusy(true);
    setHlsError(null);
    setHlsMessage(null);
    try {
      if (hlsDumpId) {
        const res = await fetch("/api/hls-dump/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vhost: selectedApp.vhost,
            app: selectedApp.app,
            stream: selectedHlsStream,
            id: hlsDumpId,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setHlsError(body.error ?? "Failed to stop HLS dump");
          return;
        }
        setHlsDumpId(null);
        setHlsMessage("Dump stopped.");
        return;
      }
      const id = `dump-${selectedHlsStream}-${Date.now()}`;
      const res = await fetch("/api/hls-dump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vhost: selectedApp.vhost,
          app: selectedApp.app,
          stream: selectedHlsStream,
          id,
          outputPath: `/opt/ovenmediaengine/recordings/hls-dump/${selectedApp.vhost}/${selectedApp.app}/${selectedHlsStream}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setHlsError(body.error ?? "Failed to start HLS dump");
        return;
      }
      setHlsDumpId(id);
      setHlsMessage("Dump started — writing to the recordings volume.");
    } finally {
      setHlsBusy(false);
    }
  }

  async function handleConcludeLive() {
    if (!selectedApp || !selectedHlsStream) return;
    setHlsBusy(true);
    setHlsError(null);
    setHlsMessage(null);
    try {
      const res = await fetch("/api/hls-dump/conclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vhost: selectedApp.vhost, app: selectedApp.app, stream: selectedHlsStream }),
      });
      const body = await res.json();
      if (!res.ok) {
        setHlsError(body.error ?? "Failed to conclude live");
        return;
      }
      setHlsMessage("Live playlist concluded — players will stop waiting for new segments.");
    } finally {
      setHlsBusy(false);
    }
  }

  return (
    <>
      <div className="row">
        <div className="grow">
          <h1>Recording</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            Records to the server&apos;s file root as .ts or .mp4, split at an interval or by schedule. Track
            selection follows the same variants as push targets.
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

      {listError ? (
        <div className="pane">
          <span className="chip warn">{listError}</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="pane">
          <p className="lead" style={{ margin: 0 }}>
            No recordings yet.
          </p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Recording</th>
              <th>Stream</th>
              <th>Tracks</th>
              <th>File</th>
              <th>Segments</th>
              <th>Size · time</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  {task.id}
                  <span className="sub">id {task.id}</span>
                </td>
                <td className="mono">{task.stream.name}</td>
                <td className="mono">
                  {task.stream.variantNames.length ? task.stream.variantNames.join(", ") : "all"}
                </td>
                <td>
                  <span className="url">{task.outputFilePath ?? task.filePath ?? DEFAULT_FILE_PATH}</span>
                </td>
                <td>{segmentsLabel(task)}</td>
                <td className="num">
                  {task.totalRecordBytes !== undefined && task.totalRecordTime !== undefined
                    ? `${formatBytes(task.totalRecordBytes)} · ${formatDuration(task.totalRecordTime)}`
                    : "—"}
                </td>
                <td>
                  <span className={`chip ${stateChipClass(task.state)}`}>
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
      )}

      <div className="row" style={{ marginTop: 18, marginBottom: 10 }}>
        <span className="grow"></span>
        <button className="btn pri" onClick={() => setShowForm((v) => !v)}>
          New recording
        </button>
      </div>
      {showForm && (
      <div className="pane">
        <div className="grid3">
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ISO · phone1" />
          </label>
          <label className="field">
            Output stream
            <input
              className="mono"
              list="rec-output-streams"
              value={streamName}
              onChange={(e) => setStreamName(e.target.value)}
              placeholder="e.g. phone1"
            />
            <datalist id="rec-output-streams">
              {outputOptions.map((o) => (
                <option key={o.name} value={o.name} />
              ))}
            </datalist>
            <span style={{ fontSize: 11 }}>The OME output name — same as the input name unless a profile renames it.</span>
          </label>
          <label className="field">
            Segments
            <select value={segmentation} onChange={(e) => setSegmentation(e.target.value as Segmentation)}>
              <option value="single">Single file</option>
              <option value="interval">Every N minutes</option>
              <option value="schedule">Cron schedule</option>
            </select>
          </label>
          <VariantPicker tracks={matchingOutput?.tracks ?? []} value={variant} onChange={setVariant} />
          {segmentation === "interval" && (
            <label className="field">
              Minutes per file
              <input
                type="number"
                min={1}
                className="mono"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              />
            </label>
          )}
          {segmentation === "schedule" && (
            <label className="field">
              Cron schedule
              <input className="mono" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
            </label>
          )}
          <label className="field">
            File path template
            <input className="mono" value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="grow"></span>
          {formError && <span className="chip warn">{formError}</span>}
          <button
            className="btn pri"
            onClick={handleStart}
            disabled={submitting || !selectedApp || !name || !streamName}
          >
            {submitting ? "Starting…" : "Start recording"}
          </button>
        </div>
      </div>
      )}

      <h2>Also on LLHLS streams</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="field" style={{ width: 220 }}>
          Stream
          <select value={selectedHlsStream} onChange={(e) => setHlsStreamName(e.target.value)}>
            {outputOptions.length === 0 && <option value="">No live output streams</option>}
            {outputOptions.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {hlsError && <span className="chip warn">{hlsError}</span>}
        {hlsMessage && <span className="chip push">{hlsMessage}</span>}
      </div>
      <div className="grid2">
        <div className="pane">
          <div className="row">
            <b>HLS dump</b>
            <span className="grow"></span>
            <button className="btn sm" onClick={handleToggleHlsDump} disabled={hlsBusy || !selectedHlsStream}>
              {hlsDumpId ? "Stop dump" : "Start dump"}
            </button>
          </div>
          <p className="lead" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Write the live LLHLS playlist and segments to disk while the stream runs — useful for instant VOD
            without re-encoding.
          </p>
        </div>
        <div className="pane">
          <div className="row">
            <b>Conclude live</b>
            <span className="grow"></span>
            <button className="btn sm" onClick={handleConcludeLive} disabled={hlsBusy || !selectedHlsStream}>
              Conclude
            </button>
          </div>
          <p className="lead" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Mark the LLHLS playlist as ended so players stop waiting for new segments when the show is over.
          </p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmStop !== null}
        title={confirmStop?.state === "ready" ? "Cancel recording?" : "Stop recording?"}
        message={`This will stop recording "${confirmStop?.stream.name}".`}
        confirmLabel={confirmStop?.state === "ready" ? "Cancel recording" : "Stop recording"}
        onConfirm={() => confirmStop && handleStop(confirmStop)}
        onCancel={() => setConfirmStop(null)}
      />
    </>
  );
}
