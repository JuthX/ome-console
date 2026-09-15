export function formatBitrate(bitsPerSec: number): string {
  const mbps = bitsPerSec / 1_000_000;
  if (mbps < 0.1) return `${(bitsPerSec / 1000).toFixed(0)} kb/s`;
  return `${mbps.toFixed(1)} Mb/s`;
}

export function formatUptime(createdTime: string, now: number): string {
  const start = new Date(createdTime).getTime();
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** RTMP -> RTMP, RtspPull -> RTSP, etc — matches the mockup's protocol tags. */
export function protocolLabel(sourceType: string): string {
  const known: Record<string, string> = {
    Rtmp: "RTMP",
    Srt: "SRT",
    RtspPull: "RTSP pull",
    Ovt: "OVT",
    WebRtc: "WebRTC",
    Mpegts: "MPEG-TS",
  };
  return known[sourceType] ?? sourceType;
}

/** A duration in ms as H:MM:SS — e.g. a push/record task's running time. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Total playback sessions across every publisher protocol for a stream. */
export function totalViewers(connections: Record<string, number>): number {
  // thumbnail = image scraping, push = outbound relay, file = recording —
  // none of these are a person watching, so none count as a "viewer".
  const excluded = new Set(["thumbnail", "push", "file"]);
  return Object.entries(connections)
    .filter(([key]) => !excluded.has(key))
    .reduce((sum, [, n]) => sum + n, 0);
}
