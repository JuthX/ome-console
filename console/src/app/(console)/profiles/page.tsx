"use client";

import { Fragment, useEffect, useState } from "react";
import { RestartWarningDialog } from "../_components/RestartWarningDialog";
import type { AppInfo, OmeStatsInfo, OutputProfileInfo } from "@/ome-client/types";

const POLL_MS = 5000;

interface AppOption {
  vhost: string;
  app: string;
}

type EncodeMode = "bypass" | "encode";

function isBypass(v?: string): boolean {
  return v === "true";
}

function formatKbps(v?: string): string {
  if (!v) return "—";
  return `${Math.round(Number(v) / 1000)}k`;
}

export default function ProfilesPage() {
  const [apps, setApps] = useState<AppOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppOption | null>(null);
  const [appDetail, setAppDetail] = useState<AppInfo | null>(null);
  const [appStats, setAppStats] = useState<OmeStatsInfo | null>(null);
  const [profiles, setProfiles] = useState<OutputProfileInfo[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [outputStreamName, setOutputStreamName] = useState("${OriginStreamName}_profile");
  const [videoMode, setVideoMode] = useState<EncodeMode>("bypass");
  const [videoCodec, setVideoCodec] = useState("h264");
  const [videoWidth, setVideoWidth] = useState("1280");
  const [videoHeight, setVideoHeight] = useState("720");
  const [videoBitrate, setVideoBitrate] = useState("3000000");
  const [videoFramerate, setVideoFramerate] = useState("30");
  const [audioMode, setAudioMode] = useState<EncodeMode>("bypass");
  const [audioCodec, setAudioCodec] = useState("aac");
  const [audioBitrate, setAudioBitrate] = useState("128000");
  const [audioSamplerate, setAudioSamplerate] = useState("48000");
  const [audioChannel, setAudioChannel] = useState("2");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [confirmCreate, setConfirmCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

    async function fetchAll() {
      try {
        const [detailRes, profilesRes] = await Promise.all([
          fetch(`/api/apps/detail?vhost=${selectedApp!.vhost}&app=${selectedApp!.app}`, { cache: "no-store" }),
          fetch(`/api/output-profiles?vhost=${selectedApp!.vhost}&app=${selectedApp!.app}`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        const detailBody = await detailRes.json();
        const profilesBody = await profilesRes.json();
        if (!detailRes.ok || !profilesRes.ok) {
          setListError(detailBody.error ?? profilesBody.error ?? "Failed to load profiles");
          return;
        }
        setListError(null);
        setAppDetail(detailBody.app);
        setAppStats(detailBody.stats);
        setProfiles(profilesBody.profiles ?? []);
      } catch (err) {
        if (!cancelled) setListError(err instanceof Error ? err.message : String(err));
      }
    }

    fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedApp]);

  const sessionCount = appStats?.totalConnections ?? 0;
  const isDeclared = appDetail?.dynamic === false;

  async function submitCreate() {
    if (!selectedApp || !name || !outputStreamName) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/output-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vhost: selectedApp.vhost,
          app: selectedApp.app,
          name,
          outputStreamName,
          encodes: {
            videos: [
              videoMode === "bypass"
                ? { name: "video", bypass: true }
                : {
                    name: "video",
                    codec: videoCodec,
                    width: Number(videoWidth),
                    height: Number(videoHeight),
                    bitrate: Number(videoBitrate),
                    framerate: Number(videoFramerate),
                  },
            ],
            audios: [
              audioMode === "bypass"
                ? { name: "audio", bypass: true }
                : {
                    name: "audio",
                    codec: audioCodec,
                    bitrate: Number(audioBitrate),
                    samplerate: Number(audioSamplerate),
                    channel: Number(audioChannel),
                  },
            ],
          },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Failed to create profile");
        return;
      }
      setName("");
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
      setConfirmCreate(false);
    }
  }

  async function handleDelete(profileName: string) {
    if (!selectedApp) return;
    try {
      await fetch(
        `/api/output-profiles?vhost=${selectedApp.vhost}&app=${selectedApp.app}&name=${encodeURIComponent(profileName)}`,
        { method: "DELETE" },
      );
      setProfiles((prev) => prev.filter((p) => p.name !== profileName));
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <div className="row">
        <div className="grow">
          <h1>Output profiles</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            How each input is turned into outputs: passthrough or transcoded renditions.
            {selectedApp && ` Applies to every stream in `}
            {selectedApp && <span className="mono">{selectedApp.app}</span>}.
          </p>
        </div>
        <button className="btn pri" onClick={() => setShowForm((v) => !v)}>
          New profile
        </button>
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

      {isDeclared && (
        <div className="note">
          Saving or deleting a profile here restarts <span className="mono">{selectedApp?.app}</span> and
          disconnects every publisher and viewer on it — do this between segments, not mid-show.
        </div>
      )}

      {listError ? (
        <div className="pane">
          <span className="chip warn">{listError}</span>
        </div>
      ) : (
        <div className="grid2" style={{ marginTop: 12 }}>
          {profiles.map((p) => (
            <div className="pane" key={p.name}>
              <div className="row">
                <b>{p.name}</b>
                {isDeclared && <span className="chip xml">declared in Server.xml</span>}
                <span className="grow"></span>
                <button className="btn sm" onClick={() => setConfirmDelete(p.name)}>
                  Delete
                </button>
              </div>
              <p className="lead" style={{ margin: "6px 0 10px", fontSize: 13 }}>
                Output name <span className="mono">{p.outputStreamName}</span>.
              </p>
              <div className="tracks">
                <span className="h">Type</span>
                <span className="h">Variant</span>
                <span className="h">Codec</span>
                <span className="h">Size / rate</span>
                <span className="h">Bitrate</span>
                {p.encodes.videos?.map((v) => (
                  <Fragment key={v.name}>
                    <span>Video</span>
                    <span className="mono">{v.name}</span>
                    <span>{isBypass(v.bypass) ? "bypass" : v.codec}</span>
                    <span>{isBypass(v.bypass) ? "source" : `${v.width}×${v.height} · ${v.framerate}`}</span>
                    <span className="num">{isBypass(v.bypass) ? "source" : formatKbps(v.bitrate)}</span>
                  </Fragment>
                ))}
                {p.encodes.audios?.map((a) => (
                  <Fragment key={a.name}>
                    <span>Audio</span>
                    <span className="mono">{a.name}</span>
                    <span>{isBypass(a.bypass) ? "bypass" : a.codec}</span>
                    <span>{isBypass(a.bypass) ? "source" : `${a.samplerate} Hz · ${a.channel}ch`}</span>
                    <span className="num">{isBypass(a.bypass) ? "source" : formatKbps(a.bitrate)}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <>
          <h2 style={{ marginTop: 18 }}>New profile</h2>
          <div className="pane">
            <div className="grid3">
              <label className="field">
                Name
                <input className="mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. abr-3" />
              </label>
              <label className="field">
                Output stream name
                <input className="mono" value={outputStreamName} onChange={(e) => setOutputStreamName(e.target.value)} />
              </label>
              <label className="field">
                Video
                <select value={videoMode} onChange={(e) => setVideoMode(e.target.value as EncodeMode)}>
                  <option value="bypass">Bypass (no re-encode)</option>
                  <option value="encode">Encode</option>
                </select>
              </label>
              {videoMode === "encode" && (
                <>
                  <label className="field">
                    Video codec
                    <select value={videoCodec} onChange={(e) => setVideoCodec(e.target.value)}>
                      <option value="h264">H.264</option>
                      <option value="h265">H.265</option>
                    </select>
                  </label>
                  <label className="field">
                    Width × Height
                    <span className="row" style={{ gap: 6 }}>
                      <input className="mono" value={videoWidth} onChange={(e) => setVideoWidth(e.target.value)} style={{ width: 70 }} />
                      <input className="mono" value={videoHeight} onChange={(e) => setVideoHeight(e.target.value)} style={{ width: 70 }} />
                    </span>
                  </label>
                  <label className="field">
                    Bitrate (bps) / fps
                    <span className="row" style={{ gap: 6 }}>
                      <input className="mono" value={videoBitrate} onChange={(e) => setVideoBitrate(e.target.value)} style={{ width: 100 }} />
                      <input className="mono" value={videoFramerate} onChange={(e) => setVideoFramerate(e.target.value)} style={{ width: 50 }} />
                    </span>
                  </label>
                </>
              )}
              <label className="field">
                Audio
                <select value={audioMode} onChange={(e) => setAudioMode(e.target.value as EncodeMode)}>
                  <option value="bypass">Bypass (no re-encode)</option>
                  <option value="encode">Encode</option>
                </select>
              </label>
              {audioMode === "encode" && (
                <>
                  <label className="field">
                    Audio codec
                    <select value={audioCodec} onChange={(e) => setAudioCodec(e.target.value)}>
                      <option value="aac">AAC</option>
                      <option value="opus">Opus</option>
                    </select>
                  </label>
                  <label className="field">
                    Bitrate (bps)
                    <input className="mono" value={audioBitrate} onChange={(e) => setAudioBitrate(e.target.value)} />
                  </label>
                  <label className="field">
                    Samplerate / channels
                    <span className="row" style={{ gap: 6 }}>
                      <input className="mono" value={audioSamplerate} onChange={(e) => setAudioSamplerate(e.target.value)} style={{ width: 80 }} />
                      <input className="mono" value={audioChannel} onChange={(e) => setAudioChannel(e.target.value)} style={{ width: 40 }} />
                    </span>
                  </label>
                </>
              )}
            </div>
            <p className="lead" style={{ fontSize: 13, marginTop: 10 }}>
              ABR ladders (multiple video rungs) and custom playlists aren&apos;t supported by this form yet — it
              creates a single video + audio rendition, matching this project&apos;s own <span className="mono">bypass_stream</span>{" "}
              profile.
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="grow"></span>
              {formError && <span className="chip warn">{formError}</span>}
              <button
                className="btn pri"
                onClick={() => setConfirmCreate(true)}
                disabled={submitting || !selectedApp || !name || !outputStreamName}
              >
                {submitting ? "Creating…" : "Create profile"}
              </button>
            </div>
          </div>
        </>
      )}

      <RestartWarningDialog
        open={confirmCreate}
        appName={selectedApp?.app ?? ""}
        sessionCount={sessionCount}
        confirmLabel="Create and restart"
        onConfirm={submitCreate}
        onCancel={() => setConfirmCreate(false)}
      />
      <RestartWarningDialog
        open={confirmDelete !== null}
        appName={selectedApp?.app ?? ""}
        sessionCount={sessionCount}
        confirmLabel="Delete and restart"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
