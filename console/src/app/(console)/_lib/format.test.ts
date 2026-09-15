import { describe, expect, it } from "vitest";
import { formatBitrate, formatBytes, formatDuration, formatUptime, protocolLabel, totalViewers } from "./format";

describe("formatBitrate", () => {
  it("uses Mb/s at or above 0.1 Mbps", () => {
    expect(formatBitrate(500_000)).toBe("0.5 Mb/s");
    expect(formatBitrate(100_000)).toBe("0.1 Mb/s");
  });

  it("uses kb/s below 0.1 Mbps", () => {
    expect(formatBitrate(50_000)).toBe("50 kb/s");
    expect(formatBitrate(0)).toBe("0 kb/s");
  });
});

describe("formatUptime", () => {
  it("formats H:MM:SS from an ISO start time and a now epoch", () => {
    const start = new Date(0).toISOString();
    expect(formatUptime(start, 3_661_000)).toBe("01:01:01");
  });

  it("clamps to 00:00:00 when now is before the start time", () => {
    const start = new Date(10_000).toISOString();
    expect(formatUptime(start, 0)).toBe("00:00:00");
  });

  it("pads single-digit minutes/seconds", () => {
    const start = new Date(0).toISOString();
    expect(formatUptime(start, 59_000)).toBe("00:00:59");
  });
});

describe("protocolLabel", () => {
  it("maps known OME source types to their display labels", () => {
    expect(protocolLabel("Rtmp")).toBe("RTMP");
    expect(protocolLabel("Srt")).toBe("SRT");
    expect(protocolLabel("RtspPull")).toBe("RTSP pull");
    expect(protocolLabel("Ovt")).toBe("OVT");
    expect(protocolLabel("WebRtc")).toBe("WebRTC");
    expect(protocolLabel("Mpegts")).toBe("MPEG-TS");
  });

  it("passes an unknown source type through unchanged", () => {
    expect(protocolLabel("SomeFutureType")).toBe("SomeFutureType");
  });
});

describe("formatDuration", () => {
  it("formats H:MM:SS from a millisecond duration", () => {
    expect(formatDuration(3_661_000)).toBe("01:01:01");
  });

  it("clamps negative durations to 00:00:00", () => {
    expect(formatDuration(-100)).toBe("00:00:00");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });
});

describe("formatBytes", () => {
  it("formats bytes under 1000 as B", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats KB at or above 1000 bytes", () => {
    expect(formatBytes(5000)).toBe("5 KB");
  });

  it("formats MB at or above 1e6 bytes", () => {
    expect(formatBytes(2_500_000)).toBe("2.5 MB");
  });

  it("formats GB at or above 1e9 bytes", () => {
    expect(formatBytes(1_500_000_000)).toBe("1.5 GB");
  });
});

describe("totalViewers", () => {
  it("sums only real viewer-facing connection types", () => {
    const connections = { webrtc: 2, llhls: 3, hlsv3: 0, srt: 1, thumbnail: 5, push: 2, ovt: 0, file: 1 };
    expect(totalViewers(connections)).toBe(6);
  });

  it("returns 0 for an empty connections object", () => {
    expect(totalViewers({})).toBe(0);
  });

  it("returns 0 when only excluded types have connections", () => {
    expect(totalViewers({ thumbnail: 3, push: 2, file: 1 })).toBe(0);
  });
});
