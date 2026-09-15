import { EventEmitter } from "node:events";
import os from "node:os";
import { getOmeClient } from "@/ome-client/client";
import type { BitrateSample, LiveSnapshot, StreamSnapshot } from "./types";

// PRD §9: "One poller talks to OME; browsers never poll OME directly." This
// is that poller — one per server process, fanning out over SSE (src/app/api/live).
const POLL_INTERVAL_MS = 3000;
const HISTORY_WINDOW_MS = 10 * 60 * 1000; // 10 min, per PRD's stream-drawer sparkline
// listAllStreams() can fail on its own while getVersion() keeps succeeding
// (apiOk stays true) — the poller deliberately keeps the last known-good
// snapshot in that case (see the comment in pollOnce()) rather than wiping
// it, so this many consecutive failures (~9s) is the threshold before we
// start telling consumers the data on screen may be stale.
const STALE_AFTER_FAILURES = 3;

// Next.js bundles instrumentation.ts (which starts the poller) and each route
// handler (which reads it) as separate module graphs — a plain module-level
// singleton here would silently split into disconnected copies, exactly like
// the DB singleton in src/db/index.ts. Same fix: pin the mutable state on
// globalThis so every copy of this module reads/writes the same object.
interface PollerState {
  emitter: EventEmitter;
  latest: LiveSnapshot;
  history: Map<string, BitrateSample[]>;
  started: boolean;
  consecutiveStreamsFailures: number;
}

declare global {
  var __omePoller: PollerState | undefined;
}

function getState(): PollerState {
  if (!globalThis.__omePoller) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100); // one per open browser tab's SSE connection
    globalThis.__omePoller = {
      emitter,
      latest: {
        updatedAt: 0,
        server: {
          apiOk: false,
          version: null,
          cpuLoadPercent: null,
          throughputIn: 0,
          throughputOut: 0,
          totalSessions: 0,
          streamsStale: false,
        },
        streams: [],
      },
      history: new Map(),
      started: false,
      consecutiveStreamsFailures: 0,
    };
  }
  return globalThis.__omePoller;
}

function historyKey(vhost: string, app: string, name: string): string {
  return `${vhost}/${app}/${name}`;
}

function appendHistory(history: Map<string, BitrateSample[]>, key: string, sample: BitrateSample): BitrateSample[] {
  const existing = history.get(key) ?? [];
  const cutoff = sample.t - HISTORY_WINDOW_MS;
  const updated = [...existing.filter((s) => s.t >= cutoff), sample];
  history.set(key, updated);
  return updated;
}

function cpuLoadPercent(): number {
  const [load1] = os.loadavg();
  const cores = os.cpus().length || 1;
  return Math.min(100, Math.round((load1 / cores) * 100));
}

async function pollOnce(): Promise<void> {
  const state = getState();
  const client = getOmeClient();
  const now = Date.now();

  let version: string | null = null;
  let apiOk = true;
  try {
    version = (await client.getVersion()).version;
  } catch {
    apiOk = false;
  }

  if (!apiOk) {
    state.consecutiveStreamsFailures = 0;
    state.latest = {
      updatedAt: now,
      server: {
        apiOk: false,
        version: null,
        cpuLoadPercent: cpuLoadPercent(),
        throughputIn: 0,
        throughputOut: 0,
        totalSessions: 0,
        streamsStale: false,
      },
      streams: [],
    };
    state.emitter.emit("snapshot", state.latest);
    return;
  }

  // A transient failure here is not the same as "zero streams are live" —
  // treating it that way would both wipe every stream's sparkline history
  // (see the cleanup pass below) and report the server as healthy with
  // nothing running, hiding the real problem. Keep the last-known-good
  // snapshot and try again next cycle instead — but after enough
  // consecutive failures, tell consumers that snapshot may be stale (see
  // STALE_AFTER_FAILURES) rather than silently serving frozen data forever
  // with apiOk still reading true.
  let streamRefs: { vhost: string; app: string; stream: string }[];
  try {
    streamRefs = await client.listAllStreams();
    state.consecutiveStreamsFailures = 0;
  } catch {
    state.consecutiveStreamsFailures += 1;
    if (state.consecutiveStreamsFailures >= STALE_AFTER_FAILURES && !state.latest.server.streamsStale) {
      state.latest = { ...state.latest, server: { ...state.latest.server, streamsStale: true } };
      state.emitter.emit("snapshot", state.latest);
    }
    return;
  }

  const streams: StreamSnapshot[] = [];
  for (const { vhost, app, stream } of streamRefs) {
    try {
      const [info, stats] = await Promise.all([
        client.getStreamInfo(vhost, app, stream),
        client.getStreamStats(vhost, app, stream),
      ]);

      const videoTrack = info.input.tracks.find((t) => t.type === "Video" && t.video);
      const audioTracks = info.input.tracks
        .filter((t) => t.type === "Audio" && t.audio)
        .map((t) => ({ codec: t.audio!.codec, bitrate: t.audio!.bitrate }));

      const key = historyKey(vhost, app, stream);
      const hist = appendHistory(state.history, key, { t: now, bitrateIn: stats.lastThroughputIn });

      streams.push({
        vhost,
        app,
        name: stream,
        sourceType: info.input.sourceType,
        sourceUrl: info.input.sourceUrl,
        createdTime: info.input.createdTime,
        video: videoTrack?.video
          ? {
              codec: videoTrack.video.codec,
              width: videoTrack.video.width,
              height: videoTrack.video.height,
              framerate: videoTrack.video.framerate,
              bitrate: videoTrack.video.bitrate,
            }
          : null,
        audioTracks,
        connections: stats.connections,
        totalConnections: stats.totalConnections,
        bitrateIn: stats.lastThroughputIn,
        history: hist,
        outputs: info.outputs,
      });
    } catch {
      // Stream vanished between listing and detail fetch (stopped mid-poll) — skip it this cycle.
    }
  }

  // Clean up history for streams that no longer exist.
  const liveKeys = new Set(streamRefs.map(({ vhost, app, stream }) => historyKey(vhost, app, stream)));
  for (const key of state.history.keys()) {
    if (!liveKeys.has(key)) state.history.delete(key);
  }

  const vhostStats = await Promise.all(
    Array.from(new Set(streamRefs.map((r) => r.vhost))).map((vhost) => client.getVhostStats(vhost).catch(() => null)),
  );
  const throughputIn = vhostStats.reduce((sum, s) => sum + (s?.lastThroughputIn ?? 0), 0);
  const throughputOut = vhostStats.reduce((sum, s) => sum + (s?.lastThroughputOut ?? 0), 0);
  const totalSessions = vhostStats.reduce(
    (sum, s) => sum + (s ? Object.values(s.connections).reduce((a, b) => a + b, 0) : 0),
    0,
  );

  state.latest = {
    updatedAt: now,
    server: {
      apiOk: true,
      version,
      cpuLoadPercent: cpuLoadPercent(),
      throughputIn,
      throughputOut,
      totalSessions,
      streamsStale: false,
    },
    streams,
  };
  state.emitter.emit("snapshot", state.latest);
}

/** Idempotent — safe to call from instrumentation.ts even across hot reloads. */
export function startPoller(): void {
  const state = getState();
  if (state.started) return;
  state.started = true;
  pollOnce().catch(() => {});
  setInterval(() => {
    pollOnce().catch(() => {});
  }, POLL_INTERVAL_MS);
}

export function getLatestSnapshot(): LiveSnapshot {
  return getState().latest;
}

/** Returns an unsubscribe function. */
export function subscribeToSnapshots(cb: (snapshot: LiveSnapshot) => void): () => void {
  const state = getState();
  state.emitter.on("snapshot", cb);
  return () => state.emitter.off("snapshot", cb);
}

export type { LiveSnapshot, StreamSnapshot } from "./types";
