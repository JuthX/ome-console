"use client";

import type { OmeTrack } from "@/ome-client/types";

export interface VariantSelection {
  video: string | null; // null = "all video variants"
  audio: string | null; // null = "all audio variants"
}

/**
 * Shared variant vocabulary across push, record and (later) multiplex —
 * PRD §11: "Users pick from the same named encodes everywhere." Matches the
 * mockup's push form exactly: two plain <select>s (video/audio), not a
 * checkbox grid — the mockup has no checkbox-based variant widget anywhere.
 */
export function VariantPicker({
  tracks,
  value,
  onChange,
}: {
  tracks: OmeTrack[];
  value: VariantSelection;
  onChange: (value: VariantSelection) => void;
}) {
  const videoTracks = tracks.filter((t) => t.type === "Video");
  const audioTracks = tracks.filter((t) => t.type === "Audio");

  return (
    <>
      <label className="field">
        Video variant
        <select
          value={value.video ?? ""}
          onChange={(e) => onChange({ ...value, video: e.target.value || null })}
        >
          <option value="">All video</option>
          {videoTracks.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 11 }}>A variant is one specific encoded rendition of this stream.</span>
      </label>
      <label className="field">
        Audio variant
        <select
          value={value.audio ?? ""}
          onChange={(e) => onChange({ ...value, audio: e.target.value || null })}
        >
          <option value="">All audio</option>
          {audioTracks.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** OME's variantNames: [] means "all variants" — omit names that are still "all". */
export function variantNamesFrom(selection: VariantSelection): string[] {
  return [selection.video, selection.audio].filter((v): v is string => v !== null);
}
