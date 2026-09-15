"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDrawer } from "./_lib/DrawerProvider";
import { useLiveSnapshot } from "./_lib/LiveSnapshotProvider";
import { useCurrentUser } from "./_lib/CurrentUserProvider";
import { hasRole } from "@/auth/roles";
import { formatBitrate, formatUptime, protocolLabel, totalViewers } from "./_lib/format";
import type { ReservedStream } from "@/db/desiredState";

// Rough placeholder cap for the bitrate meter until Output Profiles
// (Sprint 6) give us a real configured ceiling per stream.
const ASSUMED_BITRATE_CAP = 8_000_000;
const RESERVED_POLL_MS = 5000;

export default function WallPage() {
  const snapshot = useLiveSnapshot();
  const { openDrawer } = useDrawer();
  const { role } = useCurrentUser();
  // Both "Add input" (/addinput) and "Add pull source" (/streams's form) are
  // Operator-gated in proxy.ts — hide the entry points from a Viewer instead
  // of letting them click through to a redirect (matches Streams page's own
  // canAddPullSource precedent, which this page previously didn't follow).
  const canAddInput = hasRole(role, "operator");
  const [now, setNow] = useState(() => Date.now());
  const [reserved, setReserved] = useState<ReservedStream[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Streams with a queued push/record task but no live publisher yet (PRD's
  // add-input wizard: "Produces a 'reserved' tile on the multiviewer") —
  // task-list-shaped data, so it's a plain poll like /push and /rec use,
  // not folded into the SSE snapshot.
  useEffect(() => {
    let cancelled = false;
    async function fetchReserved() {
      try {
        const res = await fetch("/api/desired-state", { cache: "no-store" });
        const body = await res.json();
        if (!cancelled) setReserved(body.reserved ?? []);
      } catch {
        // Leave the previous list showing rather than flashing it away on a transient error.
      }
    }
    fetchReserved();
    const id = setInterval(fetchReserved, RESERVED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const hasLive = !!snapshot && snapshot.streams.length > 0;
  const hasAnything = hasLive || reserved.length > 0;

  return (
    <>
      <div className="row">
        <div className="grow">
          <h1>Multiviewer</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            Every input on this server, all apps. Click a tile for tracks, sessions and actions.
          </p>
        </div>
        {canAddInput && (
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn" href="/streams?addPull=1">
              Add pull source (RTSP)
            </Link>
            <Link className="btn pri" href="/addinput">
              Add input
            </Link>
          </div>
        )}
      </div>

      {!snapshot ? (
        <p className="lead">Connecting…</p>
      ) : !snapshot.server.apiOk ? (
        <div className="pane">
          <span className="chip warn">OME REST API unreachable</span>
        </div>
      ) : !hasAnything ? (
        <div className="pane">
          <p className="lead" style={{ margin: 0 }}>
            No streams are live right now.
          </p>
        </div>
      ) : (
        <div className="wall" style={{ marginTop: "18px" }}>
          {snapshot.streams.map((stream) => {
            const pct = Math.min(100, (stream.bitrateIn / ASSUMED_BITRATE_CAP) * 100);
            const isRecording = stream.connections.file > 0;
            return (
              <div
                key={`${stream.vhost}/${stream.app}/${stream.name}`}
                className="tile live"
                onClick={() => openDrawer({ vhost: stream.vhost, app: stream.app, name: stream.name })}
              >
                <div className="pic">
                  {/* eslint-disable-next-line @next/next/no-img-element -- proxied, not a static asset */}
                  <img
                    src={`/api/thumbnail?${new URLSearchParams({ app: stream.app, stream: stream.name, t: String(snapshot.updatedAt) })}`}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <div className="tag">
                    <span className="on">LIVE</span>
                    {isRecording && <span className="rec">REC</span>}
                    <span>{protocolLabel(stream.sourceType)}</span>
                  </div>
                  <div className="tc">{formatUptime(stream.createdTime, now)}</div>
                </div>
                <div className="meta">
                  <div className="name">{stream.name}</div>
                  <div className="line">
                    <span>
                      {stream.video ? `${stream.video.codec} ${stream.video.height}p${stream.video.framerate.toFixed(0)}` : "no video"}
                      {stream.audioTracks.length > 0 && ` + ${stream.audioTracks.length}× audio`}
                    </span>
                    <span className="num">{formatBitrate(stream.bitrateIn)}</span>
                  </div>
                  <div className="meter">
                    <i className={pct > 80 ? "hi" : ""} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="line">
                    <span>{stream.app}</span>
                    <span className="num">{totalViewers(stream.connections)} viewers</span>
                  </div>
                </div>
              </div>
            );
          })}
          {reserved.map((r) => (
            <div
              key={`${r.vhost}/${r.app}/${r.streamName}`}
              className="tile idle"
              onClick={() => openDrawer({ vhost: r.vhost, app: r.app, name: r.streamName })}
            >
              <div className="pic">
                <div className="tag">
                  <span>reserved</span>
                </div>
                <div className="tc">—</div>
              </div>
              <div className="meta">
                <div className="name">
                  {r.streamName} {r.label && <small>{r.label}</small>}
                </div>
                <div className="line">
                  <span>Waiting for publisher</span>
                  <span className="num">—</span>
                </div>
                <div className="meter">
                  <i style={{ width: 0 }} />
                </div>
                <div className="line">
                  <span>
                    {r.pushCount} push, {r.recordCount} record queued
                  </span>
                  <span></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
