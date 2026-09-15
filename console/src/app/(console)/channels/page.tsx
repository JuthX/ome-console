"use client";

import { useEffect, useState } from "react";
import { useLiveSnapshot } from "../_lib/LiveSnapshotProvider";
import { outputStreamsFor } from "../_lib/outputStreams";
import { SourceTrackPicker, type SourceTrackSelection } from "../_components/SourceTrackPicker";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import type { ScheduledChannelSummary, MultiplexChannelSummary } from "@/ome-client/types";

const POLL_MS = 5000;

interface AppOption {
  vhost: string;
  app: string;
}

type ScheduleMode = "file" | "stream";

/** "file://name.mp4" -> "name.mp4"; "stream://default/app/x" -> "x" (live: x) */
function describeUrl(url: string | undefined): string {
  if (!url) return "—";
  if (url.startsWith("file://")) return url.slice("file://".length);
  if (url.startsWith("stream://")) {
    const parts = url.slice("stream://".length).split("/");
    return `live: ${parts[parts.length - 1]}`;
  }
  return url;
}

function trackSource(channel: MultiplexChannelSummary, newTrackName: string | undefined): string {
  if (!newTrackName) return "—";
  for (const src of channel.sourceStreams) {
    const track = src.trackMap.find((t) => t.newTrackName === newTrackName);
    if (track) return `${src.name} · ${track.sourceTrackName}`;
  }
  return newTrackName;
}

export default function ChannelsPage() {
  const snapshot = useLiveSnapshot();
  const [apps, setApps] = useState<AppOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppOption | null>(null);

  const [scheduledChannels, setScheduledChannels] = useState<ScheduledChannelSummary[]>([]);
  const [scheduledError, setScheduledError] = useState<string | null>(null);
  const [multiplexChannels, setMultiplexChannels] = useState<MultiplexChannelSummary[]>([]);
  const [multiplexError, setMultiplexError] = useState<string | null>(null);

  const [vodFiles, setVodFiles] = useState<string[]>([]);

  // Scheduled channel form
  const [showScheduledForm, setShowScheduledForm] = useState(false);
  const [scheduledName, setScheduledName] = useState("");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("file");
  const [scheduleFile, setScheduleFile] = useState("");
  const [scheduleStream, setScheduleStream] = useState("");
  const [scheduledSubmitting, setScheduledSubmitting] = useState(false);
  const [scheduledFormError, setScheduledFormError] = useState<string | null>(null);
  const [confirmDeleteScheduled, setConfirmDeleteScheduled] = useState<string | null>(null);

  // Multiplex channel form
  const [showMultiplexForm, setShowMultiplexForm] = useState(false);
  const [multiplexName, setMultiplexName] = useState("");
  const [videoSel, setVideoSel] = useState<SourceTrackSelection>({ streamName: null, trackName: null });
  const [audioSel, setAudioSel] = useState<SourceTrackSelection>({ streamName: null, trackName: null });
  const [multiplexSubmitting, setMultiplexSubmitting] = useState(false);
  const [multiplexFormError, setMultiplexFormError] = useState<string | null>(null);
  const [confirmDeleteMultiplex, setConfirmDeleteMultiplex] = useState<string | null>(null);

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
    fetch("/api/vod-files", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setVodFiles(body.files ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedApp) return;
    let cancelled = false;

    async function fetchChannels() {
      try {
        const [sRes, mRes] = await Promise.all([
          fetch(`/api/scheduled-channels?vhost=${selectedApp!.vhost}&app=${selectedApp!.app}`, { cache: "no-store" }),
          fetch(`/api/multiplex-channels?vhost=${selectedApp!.vhost}&app=${selectedApp!.app}`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const sBody = await sRes.json();
        const mBody = await mRes.json();
        if (sRes.ok) {
          setScheduledError(null);
          setScheduledChannels(sBody.channels ?? []);
        } else {
          setScheduledError(sBody.error ?? "Failed to load scheduled channels");
        }
        if (mRes.ok) {
          setMultiplexError(null);
          setMultiplexChannels(mBody.channels ?? []);
        } else {
          setMultiplexError(mBody.error ?? "Failed to load multiplex channels");
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setScheduledError(message);
          setMultiplexError(message);
        }
      }
    }

    fetchChannels();
    const id = setInterval(fetchChannels, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedApp]);

  const outputOptions = selectedApp ? outputStreamsFor(snapshot, selectedApp.vhost, selectedApp.app) : [];

  async function handleCreateScheduled() {
    if (!selectedApp || !scheduledName || !scheduleFile) return;
    setScheduledSubmitting(true);
    setScheduledFormError(null);
    try {
      const fallbackProgram = { items: [{ url: `file://${scheduleFile}`, start: 0, duration: -1 }] };
      const programs =
        scheduleMode === "stream" && scheduleStream
          ? [
              {
                name: "1",
                scheduled: new Date().toISOString(),
                repeat: true,
                items: [{ url: `stream://${selectedApp.vhost}/${selectedApp.app}/${scheduleStream}`, duration: -1 }],
              },
            ]
          : undefined;
      const res = await fetch("/api/scheduled-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vhost: selectedApp.vhost,
          app: selectedApp.app,
          stream: { name: scheduledName, videoTrack: true, audioTrack: true },
          fallbackProgram,
          programs,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setScheduledFormError(body.error ?? "Failed to create scheduled channel");
        return;
      }
      setScheduledName("");
      setScheduleFile("");
      setScheduleStream("");
      setShowScheduledForm(false);
    } catch (err) {
      setScheduledFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setScheduledSubmitting(false);
    }
  }

  async function handleDeleteScheduled(name: string) {
    if (!selectedApp) return;
    try {
      await fetch(
        `/api/scheduled-channels?vhost=${selectedApp.vhost}&app=${selectedApp.app}&name=${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      setScheduledChannels((prev) => prev.filter((c) => c.name !== name));
    } finally {
      setConfirmDeleteScheduled(null);
    }
  }

  async function handleCreateMultiplex() {
    if (!selectedApp || !multiplexName || !videoSel.streamName || !videoSel.trackName || !audioSel.streamName || !audioSel.trackName) {
      setMultiplexFormError("Output name, video source and audio source are all required.");
      return;
    }
    setMultiplexSubmitting(true);
    setMultiplexFormError(null);
    try {
      const videoTrackName = `${videoSel.streamName}_${videoSel.trackName}`;
      const audioTrackName = `${audioSel.streamName}_${audioSel.trackName}`;
      const sourceStreams = [
        {
          name: videoSel.streamName,
          url: `stream://${selectedApp.vhost}/${selectedApp.app}/${videoSel.streamName}`,
          trackMap: [{ sourceTrackName: videoSel.trackName, newTrackName: videoTrackName }],
        },
      ];
      if (audioSel.streamName === videoSel.streamName) {
        sourceStreams[0].trackMap.push({ sourceTrackName: audioSel.trackName, newTrackName: audioTrackName });
      } else {
        sourceStreams.push({
          name: audioSel.streamName,
          url: `stream://${selectedApp.vhost}/${selectedApp.app}/${audioSel.streamName}`,
          trackMap: [{ sourceTrackName: audioSel.trackName, newTrackName: audioTrackName }],
        });
      }
      const res = await fetch("/api/multiplex-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vhost: selectedApp.vhost,
          app: selectedApp.app,
          outputStream: { name: multiplexName },
          sourceStreams,
          playlists: [
            {
              name: "default",
              fileName: "abr",
              renditions: [{ name: "default", video: videoTrackName, audio: audioTrackName }],
            },
          ],
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMultiplexFormError(body.error ?? "Failed to create multiplex channel");
        return;
      }
      setMultiplexName("");
      setVideoSel({ streamName: null, trackName: null });
      setAudioSel({ streamName: null, trackName: null });
      setShowMultiplexForm(false);
    } catch (err) {
      setMultiplexFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setMultiplexSubmitting(false);
    }
  }

  async function handleDeleteMultiplex(name: string) {
    if (!selectedApp) return;
    try {
      await fetch(
        `/api/multiplex-channels?vhost=${selectedApp.vhost}&app=${selectedApp.app}&name=${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      setMultiplexChannels((prev) => prev.filter((c) => c.name !== name));
    } finally {
      setConfirmDeleteMultiplex(null);
    }
  }

  return (
    <>
      <h1>Channels</h1>
      <p className="lead">
        Server-side sources that aren&apos;t a single publisher: playlists that hold a slot until a live feed
        arrives, and multiplexers that combine tracks from several inputs into one output.
      </p>

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

      <h2>Scheduled channels</h2>
      {scheduledError ? (
        <div className="pane">
          <span className="chip warn">{scheduledError}</span>
        </div>
      ) : scheduledChannels.length === 0 ? (
        <div className="pane">
          <p className="lead" style={{ margin: 0 }}>
            No scheduled channels yet.
          </p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Now playing</th>
              <th>Playlist</th>
              <th>Fallback</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {scheduledChannels.map((c) => (
              <tr key={c.name}>
                <td className="mono">{c.name}</td>
                <td>
                  {describeUrl(c.currentProgram?.currentItem.url)}
                  {c.currentProgram?.repeat && <span className="sub">loop</span>}
                </td>
                <td>{c.programs.length > 0 ? c.programs.map((p) => p.name).join(" · ") : "—"}</td>
                <td>{describeUrl(c.fallbackProgram?.items[0]?.url)}</td>
                <td>
                  <span className="chip">{c.currentProgram?.state ?? "—"}</span>
                </td>
                <td className="acts">
                  <button className="btn sm" onClick={() => setConfirmDeleteScheduled(c.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Multiplex channels</h2>
      {multiplexError ? (
        <div className="pane">
          <span className="chip warn">{multiplexError}</span>
        </div>
      ) : multiplexChannels.length === 0 ? (
        <div className="pane">
          <p className="lead" style={{ margin: 0 }}>
            No multiplex channels yet.
          </p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Channel</th>
              <th>Video from</th>
              <th>Audio from</th>
              <th>Output</th>
              <th>State</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {multiplexChannels.map((c) => {
              const rendition = c.playlists[0]?.renditions[0];
              return (
                <tr key={c.name}>
                  <td className="mono">{c.name}</td>
                  <td>{trackSource(c, rendition?.video)}</td>
                  <td>{trackSource(c, rendition?.audio)}</td>
                  <td className="mono">{c.outputStream.name}</td>
                  <td>
                    <span className="chip">{c.state}</span>
                    {c.pullingMessage && <span className="sub">{c.pullingMessage}</span>}
                  </td>
                  <td className="acts">
                    <button className="btn sm" onClick={() => setConfirmDeleteMultiplex(c.name)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="row" style={{ marginTop: 12, marginBottom: 18 }}>
        <button className="btn pri" onClick={() => setShowScheduledForm((v) => !v)}>
          New scheduled channel
        </button>
        <button className="btn" onClick={() => setShowMultiplexForm((v) => !v)}>
          New multiplex channel
        </button>
      </div>

      {showScheduledForm && (
        <>
          <h2>New scheduled channel</h2>
          <div className="pane" style={{ marginBottom: 18 }}>
            <div className="grid3">
              <label className="field">
                Channel name
                <input
                  className="mono"
                  value={scheduledName}
                  onChange={(e) => setScheduledName(e.target.value)}
                  placeholder="e.g. lobby-loop"
                />
              </label>
              <label className="field">
                Mode
                <select value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as ScheduleMode)}>
                  <option value="file">Loop a file</option>
                  <option value="stream">Show a live stream (fallback to a file)</option>
                </select>
              </label>
              <label className="field">
                {scheduleMode === "file" ? "File" : "Fallback file"}
                <select value={scheduleFile} onChange={(e) => setScheduleFile(e.target.value)}>
                  <option value="">— choose —</option>
                  {vodFiles.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              {scheduleMode === "stream" && (
                <label className="field">
                  Live stream
                  <input
                    className="mono"
                    list="channels-output-streams"
                    value={scheduleStream}
                    onChange={(e) => setScheduleStream(e.target.value)}
                    placeholder="e.g. vmix-program"
                  />
                  <datalist id="channels-output-streams">
                    {outputOptions.map((o) => (
                      <option key={o.name} value={o.name} />
                    ))}
                  </datalist>
                  <span style={{ fontSize: 11 }}>Doesn&apos;t have to be live yet — the channel waits, same as Push/Recording.</span>
                </label>
              )}
            </div>
            {vodFiles.length === 0 && (
              <p className="lead" style={{ fontSize: 13, marginTop: 10 }}>
                No files found — copy a video into the host&apos;s <span className="mono">vod/</span> directory first.
              </p>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <span className="grow"></span>
              {scheduledFormError && <span className="chip warn">{scheduledFormError}</span>}
              <button
                className="btn pri"
                onClick={handleCreateScheduled}
                disabled={
                  scheduledSubmitting ||
                  !selectedApp ||
                  !scheduledName ||
                  !scheduleFile ||
                  (scheduleMode === "stream" && !scheduleStream)
                }
              >
                {scheduledSubmitting ? "Creating…" : "Create channel"}
              </button>
            </div>
          </div>
        </>
      )}

      {showMultiplexForm && (
        <>
          <h2>New multiplex channel</h2>
          <div className="pane" style={{ marginBottom: 18 }}>
            <div className="grid3">
              <label className="field">
                Output name
                <input
                  className="mono"
                  value={multiplexName}
                  onChange={(e) => setMultiplexName(e.target.value)}
                  placeholder="e.g. program-commentary"
                />
              </label>
              <SourceTrackPicker label="Video" options={outputOptions} trackType="Video" value={videoSel} onChange={setVideoSel} />
              <SourceTrackPicker label="Audio" options={outputOptions} trackType="Audio" value={audioSel} onChange={setAudioSel} />
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="grow"></span>
              {multiplexFormError && <span className="chip warn">{multiplexFormError}</span>}
              <button className="btn pri" onClick={handleCreateMultiplex} disabled={multiplexSubmitting || !selectedApp}>
                {multiplexSubmitting ? "Creating…" : "Create channel"}
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDeleteScheduled !== null}
        title="Delete scheduled channel?"
        message={`This stops and removes "${confirmDeleteScheduled}".`}
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteScheduled && handleDeleteScheduled(confirmDeleteScheduled)}
        onCancel={() => setConfirmDeleteScheduled(null)}
      />
      <ConfirmDialog
        open={confirmDeleteMultiplex !== null}
        title="Delete multiplex channel?"
        message={`This stops and removes "${confirmDeleteMultiplex}".`}
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteMultiplex && handleDeleteMultiplex(confirmDeleteMultiplex)}
        onCancel={() => setConfirmDeleteMultiplex(null)}
      />
    </>
  );
}
