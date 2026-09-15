import type { OmeStreamOutput } from "@/ome-client/types";

export interface BitrateSample {
  t: number; // epoch ms
  bitrateIn: number; // bits/sec
}

export interface StreamSnapshot {
  vhost: string;
  app: string;
  name: string;
  sourceType: string;
  sourceUrl: string;
  createdTime: string;
  video: {
    codec: string;
    width: number;
    height: number;
    framerate: number;
    bitrate: number;
  } | null;
  audioTracks: { codec: string; bitrate: number }[];
  connections: {
    webrtc: number;
    llhls: number;
    hlsv3: number;
    srt: number;
    thumbnail: number;
    push: number;
    ovt: number;
    file: number;
  };
  totalConnections: number;
  bitrateIn: number;
  /** Last ~10 minutes of bitrateIn samples, oldest first. */
  history: BitrateSample[];
  /** Output streams (post-profile) this input produces — push/record targets bind to these, not the input name (PRD §6 #4). */
  outputs: OmeStreamOutput[];
}

export interface ServerSnapshot {
  apiOk: boolean;
  version: string | null;
  cpuLoadPercent: number | null;
  throughputIn: number;
  throughputOut: number;
  totalSessions: number;
  /** True once listAllStreams() has failed several cycles in a row while
   *  apiOk stayed true — the poller deliberately keeps serving the last
   *  known-good `streams`/history rather than wiping it on a transient
   *  error, so this is the only signal that what's on screen may be stale. */
  streamsStale: boolean;
}

export interface LiveSnapshot {
  updatedAt: number;
  server: ServerSnapshot;
  streams: StreamSnapshot[];
}
