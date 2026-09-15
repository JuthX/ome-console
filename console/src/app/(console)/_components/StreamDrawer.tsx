"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useDrawer } from "../_lib/DrawerProvider";
import { useLiveSnapshot } from "../_lib/LiveSnapshotProvider";
import { formatBitrate, formatUptime, protocolLabel, totalViewers } from "../_lib/format";
import { ConfirmDialog } from "./ConfirmDialog";

const CONNECTION_LABELS: Record<string, string> = {
  webrtc: "WebRTC",
  llhls: "LLHLS",
  hlsv3: "HLS",
  srt: "SRT",
  push: "Push",
  ovt: "OVT",
};

type ActionPanel = "id3" | "subtitle" | null;

interface StreamKey {
  vhost: string;
  app: string;
  name: string;
}

/**
 * Sprint 4b stream actions. A separate component keyed on the stream
 * identity (rendered with `key={vhost/app/name}` below) so switching
 * streams resets this local state via remount instead of an effect that
 * calls setState synchronously (react-hooks/set-state-in-effect).
 */
function DrawerActions({ target, onDisconnected }: { target: StreamKey; onDisconnected: () => void }) {
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);
  const [id3FrameType, setId3FrameType] = useState("TXXX");
  const [id3Info, setId3Info] = useState("");
  const [id3Data, setId3Data] = useState("");
  const [subtitleLabel, setSubtitleLabel] = useState("en");
  const [subtitleText, setSubtitleText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [hlsDumpId, setHlsDumpId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function callAction(path: string, body: unknown): Promise<boolean> {
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(responseBody.error ?? "Action failed");
        return false;
      }
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSendId3() {
    if (!id3Data) return;
    const ok = await callAction("/api/stream-events/id3", {
      vhost: target.vhost,
      app: target.app,
      stream: target.name,
      frameType: id3FrameType,
      info: id3Info,
      data: id3Data,
    });
    if (ok) {
      setId3Data("");
      setActionPanel(null);
    }
  }

  async function handleSendSubtitle() {
    if (!subtitleText) return;
    const ok = await callAction("/api/stream-events/subtitles", {
      vhost: target.vhost,
      app: target.app,
      stream: target.name,
      label: subtitleLabel,
      text: subtitleText,
    });
    if (ok) {
      setSubtitleText("");
      setActionPanel(null);
    }
  }

  async function handleToggleHlsDump() {
    if (hlsDumpId) {
      const ok = await callAction("/api/hls-dump/stop", {
        vhost: target.vhost,
        app: target.app,
        stream: target.name,
        id: hlsDumpId,
      });
      if (ok) setHlsDumpId(null);
      return;
    }
    const id = `dump-${target.name}-${Date.now()}`;
    const ok = await callAction("/api/hls-dump", {
      vhost: target.vhost,
      app: target.app,
      stream: target.name,
      id,
      outputPath: `/opt/ovenmediaengine/recordings/hls-dump/${target.vhost}/${target.app}/${target.name}`,
    });
    if (ok) setHlsDumpId(id);
  }

  async function handleDisconnect() {
    const ok = await callAction("/api/streams/disconnect", {
      vhost: target.vhost,
      app: target.app,
      stream: target.name,
    });
    setConfirmDisconnect(false);
    if (ok) onDisconnected();
  }

  return (
    <>
      <div className="acts-row">
        <Link className="btn sm" href={`/push?stream=${encodeURIComponent(target.name)}`}>
          Start push
        </Link>
        <Link className="btn sm" href={`/rec?stream=${encodeURIComponent(target.name)}`}>
          Start recording
        </Link>
        <button className="btn sm" onClick={() => setActionPanel(actionPanel === "id3" ? null : "id3")}>
          Send ID3 event
        </button>
        <button className="btn sm" onClick={() => setActionPanel(actionPanel === "subtitle" ? null : "subtitle")}>
          Send subtitle
        </button>
        <button className="btn sm" onClick={handleToggleHlsDump} disabled={actionBusy}>
          {hlsDumpId ? "Stop HLS dump" : "HLS dump"}
        </button>
        <button className="btn sm danger" onClick={() => setConfirmDisconnect(true)}>
          Disconnect
        </button>
      </div>

      {actionError && (
        <div className="pane" style={{ marginBottom: 12 }}>
          <span className="chip warn">{actionError}</span>
        </div>
      )}

      {actionPanel === "id3" && (
        <div className="pane" style={{ marginBottom: 12 }}>
          <div className="grid3">
            <label className="field">
              Frame type
              <input className="mono" value={id3FrameType} onChange={(e) => setId3FrameType(e.target.value)} />
            </label>
            <label className="field">
              Info (TXXX only)
              <input value={id3Info} onChange={(e) => setId3Info(e.target.value)} />
            </label>
            <label className="field">
              Data
              <input value={id3Data} onChange={(e) => setId3Data(e.target.value)} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
            <button className="btn pri sm" onClick={handleSendId3} disabled={actionBusy || !id3Data}>
              Send
            </button>
          </div>
        </div>
      )}

      {actionPanel === "subtitle" && (
        <div className="pane" style={{ marginBottom: 12 }}>
          <div className="grid2">
            <label className="field">
              Label
              <input value={subtitleLabel} onChange={(e) => setSubtitleLabel(e.target.value)} />
            </label>
            <label className="field">
              Text
              <input value={subtitleText} onChange={(e) => setSubtitleText(e.target.value)} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
            <button className="btn pri sm" onClick={handleSendSubtitle} disabled={actionBusy || !subtitleText}>
              Send
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect publisher?"
        message={`This immediately drops "${target.name}"'s publisher connection.`}
        confirmLabel="Disconnect"
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </>
  );
}

export function StreamDrawer() {
  const { open, closeDrawer } = useDrawer();
  const snapshot = useLiveSnapshot();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const stream = open
    ? snapshot?.streams.find((s) => s.vhost === open.vhost && s.app === open.app && s.name === open.name)
    : undefined;

  // Keep the drawer mounted (for the close transition) even once `open` is
  // cleared, but don't render stale content once there's genuinely nothing to show.
  if (!open) return <div className="drawer" />;

  const maxHistory = Math.max(1, ...(stream?.history.map((h) => h.bitrateIn) ?? [1]));

  return (
    <div className={`drawer${open ? " on" : ""}`}>
      <div className="head">
        <span className={`chip${stream ? " live" : " off"}`}>{open.name}</span>
        <span className="mono" style={{ color: "var(--ink-3)" }}>
          {open.vhost}/{open.app}
        </span>
        <button className="x" onClick={closeDrawer} aria-label="Close">
          ×
        </button>
      </div>

      {stream && <DrawerActions key={`${open.vhost}/${open.app}/${open.name}`} target={open} onDisconnected={closeDrawer} />}

      {!stream ? (
        <p className="lead">This stream is no longer live.</p>
      ) : (
        <>
          <h2>Input</h2>
          <div className="pane">
            <dl className="kv">
              <dt>Protocol</dt>
              <dd>{protocolLabel(stream.sourceType)}</dd>
              <dt>Peer</dt>
              <dd className="mono">{stream.sourceUrl}</dd>
              <dt>Uptime</dt>
              <dd className="mono">{formatUptime(stream.createdTime, now)}</dd>
              <dt>Bitrate</dt>
              <dd className="mono">{formatBitrate(stream.bitrateIn)}</dd>
            </dl>
          </div>

          <h2>Tracks</h2>
          <div className="tracks">
            <span className="h">Type</span>
            <span className="h">Codec</span>
            <span className="h">Detail</span>
            <span className="h">Bitrate</span>
            <span></span>
            {stream.video && (
              <>
                <span>Video</span>
                <span>{stream.video.codec}</span>
                <span>
                  {stream.video.width}×{stream.video.height} @{stream.video.framerate.toFixed(0)}fps
                </span>
                <span className="mono">{formatBitrate(stream.video.bitrate)}</span>
                <span></span>
              </>
            )}
            {stream.audioTracks.map((track, i) => (
              <Fragment key={i}>
                <span>Audio</span>
                <span>{track.codec}</span>
                <span></span>
                <span className="mono">{formatBitrate(track.bitrate)}</span>
                <span></span>
              </Fragment>
            ))}
          </div>

          <h2>Sessions</h2>
          <div className="pane">
            <div className="row" style={{ flexWrap: "wrap", gap: "12px" }}>
              {Object.entries(stream.connections)
                .filter(([key]) => key in CONNECTION_LABELS)
                .map(([key, count]) => (
                  <span key={key} className="chip">
                    {CONNECTION_LABELS[key]} <b className="num">{count}</b>
                  </span>
                ))}
              {/* "chip push" here is just borrowing the mockup's green-dot styling
                  for a summary chip — unrelated to "push" the publish target. */}
              <span className="chip push">
                Total viewers <b className="num">{totalViewers(stream.connections)}</b>
              </span>
            </div>
          </div>

          <h2>Bitrate — last 10 min</h2>
          <div className="pane">
            {stream.history.length < 2 ? (
              <p className="lead" style={{ margin: 0 }}>
                Collecting data…
              </p>
            ) : (
              <div className="spark">
                {stream.history.map((sample, i) => (
                  <i key={i} style={{ height: `${Math.max(4, (sample.bitrateIn / maxHistory) * 100)}%` }} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
