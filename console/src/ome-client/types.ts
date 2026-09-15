// Shared request/response types for the pinned OME version (v0.21.0).
// Only what Sprint 2 actually calls lives here; each later sprint adds the
// types its own endpoints need rather than speculatively typing the whole API.

export interface OmeEnvelope<T> {
  message: string;
  statusCode: number;
  response: T;
}

export interface OmeVersionResponse {
  version: string;
  gitVersion?: string;
}

export interface OmeTimebase {
  num: number;
  den: number;
}

export interface OmeVideoTrackInfo {
  bitrate: number;
  bitrateAvg: number;
  bitrateLatest: number;
  bypass: boolean;
  codec: string;
  framerate: number;
  width: number;
  height: number;
  keyFrameInterval: number;
  timebase: OmeTimebase;
}

export interface OmeAudioTrackInfo {
  bitrate: number;
  bitrateAvg: number;
  bitrateLatest: number;
  bypass: boolean;
  codec: string;
  channel: number;
  samplerate: number;
  timebase: OmeTimebase;
}

export interface OmeTrack {
  id: number;
  name: string;
  type: "Video" | "Audio" | "Data";
  video?: OmeVideoTrackInfo;
  audio?: OmeAudioTrackInfo;
}

export interface OmeStreamOutput {
  name: string;
  tracks: OmeTrack[];
}

export interface OmeStreamInfo {
  name: string;
  input: {
    createdTime: string;
    sourceType: string; // "Rtmp" | "Srt" | "RtspPull" | "Ovt" | ...
    sourceUrl: string; // peer address, e.g. "TCP://1.2.3.4:5678/tcp"
    tracks: OmeTrack[];
  };
  outputs: OmeStreamOutput[];
}

// Sprint 4: push/record write endpoints. Field names/states verified
// against a real v0.21.0 instance with a live ffmpeg RTMP stream (not just
// docs) — the docs page under-documented several fields (totalsentBytes is
// lowercase-s, records use "recording" not "started", and startRecord's
// response includes real running byte/time counters the docs omitted).

export type PushProtocol = "rtmp" | "srt" | "mpegts";
export type PushState = "ready" | "connecting" | "pushing" | "stopping" | "stopped" | "error";

export interface StartPushRequest {
  id: string;
  stream: { name: string; variantNames?: string[] };
  protocol: PushProtocol;
  url: string;
  streamKey?: string;
}

export interface PushTask {
  id: string;
  state: PushState;
  vhost: string;
  app: string;
  stream: { name: string; trackIds: number[]; variantNames: string[] };
  protocol: PushProtocol;
  url: string;
  streamKey?: string;
  sentBytes: number;
  sentTime: number;
  totalsentBytes: number;
  totalsentTime: number;
  createdTime: string;
  startTime?: string;
  finishTime?: string;
}

export type RecordState = "ready" | "recording" | "stopping" | "stopped" | "error";

export interface StartRecordRequest {
  id: string;
  stream: { name: string; variantNames?: string[] };
  interval?: number; // ms
  schedule?: string; // crontab syntax
  segmentationRule?: "continuity" | "discontinuity";
  filePath?: string;
  infoPath?: string;
}

export interface RecordTask {
  id: string;
  state: RecordState;
  vhost: string;
  app: string;
  stream: { name: string; trackIds: number[]; variantNames: string[] };
  interval?: number;
  schedule?: string;
  segmentationRule?: "continuity" | "discontinuity";
  filePath?: string;
  infoPath?: string;
  /** Resolved absolute paths (filePath/infoPath are still the requested templates). */
  outputFilePath?: string;
  outputInfoPath?: string;
  createdTime: string;
  startTime?: string;
  /** Bytes/ms written so far in the current segment, and cumulative across all segments. */
  recordBytes?: number;
  recordTime?: number;
  totalRecordBytes?: number;
  totalRecordTime?: number;
}

// Sprint 4b: LLHLS dump/conclude + stream actions. Verified against a real
// v0.21.0 instance with a live ffmpeg stream — unlike push/record, all of
// these endpoints put the stream name in the URL path
// (/apps/{app}/streams/{stream}:action or DELETE), not the request body, and
// none return a `response` payload beyond {message, statusCode} (confirmed;
// the docs' example response for startHlsDump/stopHlsDump — a bare stream
// name array — turned out to be a copy-paste artifact, not real).

export interface StartHlsDumpRequest {
  id: string;
  outputStreamName: string;
  outputPath: string;
  playlist?: string[];
  infoFile?: string;
}

export interface SendEventRequest {
  eventFormat: "id3v2";
  eventType?: "event" | "video" | "audio";
  startOffset?: number;
  events: { frameType: string; info?: string; data: string }[];
}

export interface SendSubtitlesRequest {
  format: "webvtt";
  data: {
    label: string;
    subtitles: { startOffset?: number; durationMs?: number; settings?: string; text: string }[];
  }[];
}

export interface CreatePullStreamRequest {
  name: string;
  urls: string[];
  properties?: {
    persistent?: boolean;
    noInputFailoverTimeoutMs?: number;
    unusedStreamDeletionTimeoutMs?: number;
    ignoreRtcpSRTimestamp?: boolean;
    relay?: boolean;
  };
}

/** Same shape at server/vhost/app/stream scope — only the request path differs. */
export interface OmeStatsInfo {
  createdTime: string;
  lastUpdatedTime: string;
  lastRecvTime: string;
  lastSentTime: string;
  totalConnections: number;
  maxTotalConnections: number;
  totalBytesIn: number;
  totalBytesOut: number;
  lastThroughputIn: number;
  lastThroughputOut: number;
  avgThroughputIn: number;
  avgThroughputOut: number;
  maxThroughputIn: number;
  maxThroughputOut: number;
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
}

// Sprint 5b: ScheduledChannel + MultiplexChannel. Unlike push/record/stream
// actions, these are plain REST resources — no `:action` suffix — and
// `stream.name`/`outputStream.name` in the create body doubles as the
// channel's own identifier (no separate task id).

export interface ScheduleItem {
  url: string; // "file://name.mp4" (resolved under Server.xml's MediaRootDir) or "stream://{vhost}/{app}/{stream}"
  start?: number; // ms offset into the item
  duration?: number; // ms; -1 = play indefinitely
}

export interface ScheduleProgram {
  name: string;
  scheduled: string; // ISO8601 with timezone offset
  repeat?: boolean;
  items: ScheduleItem[];
}

export interface CreateScheduledChannelRequest {
  stream: { name: string; videoTrack?: boolean; audioTrack?: boolean };
  fallbackProgram?: { items: ScheduleItem[] };
  programs?: ScheduleProgram[];
}

export interface ScheduledChannelInfo {
  stream: { name: string; videoTrack?: boolean; audioTrack?: boolean };
  fallbackProgram?: { items: ScheduleItem[] };
  programs: ScheduleProgram[];
  currentProgram?: {
    name: string;
    scheduled: string;
    repeat: boolean;
    duration: number;
    end: string;
    state: string;
    currentItem: { url: string; start: number; duration: number; currentPosition: number };
  };
}

export interface MultiplexTrackMap {
  sourceTrackName: string;
  newTrackName: string;
  bitrateConf?: number;
  framerateConf?: number;
}

export interface MultiplexSourceStream {
  name: string;
  url: string; // "stream://{vhost}/{app}/{stream}"
  trackMap: MultiplexTrackMap[];
}

export interface MultiplexRendition {
  name: string;
  video: string; // a newTrackName from one of sourceStreams[].trackMap
  audio: string; // a newTrackName from one of sourceStreams[].trackMap (may be a different source)
}

export interface MultiplexPlaylist {
  name: string;
  fileName: string;
  options?: Record<string, unknown>;
  renditions: MultiplexRendition[];
}

export interface CreateMultiplexChannelRequest {
  outputStream: { name: string };
  sourceStreams: MultiplexSourceStream[];
  playlists: MultiplexPlaylist[];
}

export interface MultiplexChannelInfo {
  state: string; // docs show "Pulling"; "Playing"/"Error" by name only — no full enum documented
  pullingMessage?: string;
  outputStream: { name: string };
  sourceStreams: MultiplexSourceStream[];
  playlists: MultiplexPlaylist[];
}

// List endpoints only return names — routes attach it back onto the detail
// fetch. Defined here (not in the route files) so client components can
// import the type without transitively pulling in @/db's better-sqlite3
// dependency through an `import type` of a route module.
export type ScheduledChannelSummary = ScheduledChannelInfo & { name: string };
export type MultiplexChannelSummary = MultiplexChannelInfo & { name: string };

// Sprint 6: VirtualHost/Application/OutputProfile. Shapes confirmed against
// a real v0.21.0 instance (GET /v1/vhosts/default, GET .../apps/app) — OME's
// XML→JSON conversion returns every numeric-looking field as a STRING
// ("128000", not 128000), and GET's `playlists[].rendition_templates` is
// snake_case while everything else on the same object is camelCase. Typed
// as `string` throughout to match reality rather than the number type a
// naive read of OME's own docs would suggest.

export interface VhostInfo {
  name: string;
  distribution?: string;
  host: {
    names: string[];
    tls?: { certPath: string; chainCertPath?: string; keyPath: string };
  };
  // Sprint 7a: present once enabled in Server.xml — confirmed camelCase via
  // OME's REST API docs' POST /v1/vhosts request/response examples (a
  // different casing convention than Server.xml's own PascalCase XML tags).
  // `enables.providers`/`enables.publishers` are comma-joined strings, not arrays.
  signedPolicy?: {
    policyQueryKeyName: string;
    signatureQueryKeyName: string;
    secretKey: string;
    enables: { providers?: string; publishers?: string };
  };
  admissionWebhooks?: {
    controlServerUrl: string;
    secretKey: string;
    timeout: string;
    enables: { providers?: string; publishers?: string };
  };
}

/** `providers`/`publishers`: key presence = enabled (confirmed empirically — an enabled
 * protocol appears as a key, possibly with an empty object value). */
export interface AppInfo {
  dynamic: boolean; // false = declared in Server.xml (PRD §6 #1) — read-only via API
  name: string;
  type: string;
  outputProfiles: { outputProfile: OutputProfileInfo[] };
  providers: Record<string, Record<string, unknown>>;
  publishers: Record<string, Record<string, unknown>>;
}

export interface OutputProfileEncodeVideo {
  name: string;
  bypass?: string;
  codec?: string;
  width?: string;
  height?: string;
  bitrate?: string;
  framerate?: string;
  bypassIfMatch?: Record<string, string>;
}

export interface OutputProfileEncodeAudio {
  name: string;
  bypass?: string;
  codec?: string;
  bitrate?: string;
  samplerate?: string;
  channel?: string;
  bypassIfMatch?: Record<string, string>;
}

export interface OutputProfileEncodeImage {
  codec?: string;
  framerate?: string;
  width?: string;
  height?: string;
}

export interface OutputProfileInfo {
  name: string;
  outputStreamName: string;
  encodes: {
    videos?: OutputProfileEncodeVideo[];
    audios?: OutputProfileEncodeAudio[];
    images?: OutputProfileEncodeImage[];
  };
  // Playlist/rendition-template shape is real but under-documented (only
  // confirmed via a live GET, not the create-body docs) — read-only display
  // in this sprint's UI, not editable via the create form.
  playlists?: unknown[];
}

/** POST body when creating a profile — an array (OME accepts a batch), always sent as one-element here. */
export interface CreateOutputProfileRequest {
  name: string;
  outputStreamName: string;
  encodes: {
    videos?: {
      name: string;
      bypass?: boolean;
      codec?: string;
      width?: number;
      height?: number;
      bitrate?: number;
      framerate?: number;
      bypassIfMatch?: Record<string, string>;
    }[];
    audios?: {
      name: string;
      bypass?: boolean;
      codec?: string;
      bitrate?: number;
      samplerate?: number;
      channel?: number;
      bypassIfMatch?: Record<string, string>;
    }[];
  };
}
