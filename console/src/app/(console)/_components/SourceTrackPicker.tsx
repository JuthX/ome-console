"use client";

import type { OutputStreamOption } from "../_lib/outputStreams";

export interface SourceTrackSelection {
  streamName: string | null;
  trackName: string | null;
}

/**
 * Independent stream+track picker for multiplex channels — unlike
 * VariantPicker (one stream's video+audio pair), a multiplex channel needs
 * two of these, each picking a (stream, track) pair from a *different*
 * source stream (PRD: "pick a video track from one input, audio tracks
 * from others").
 */
export function SourceTrackPicker({
  label,
  options,
  trackType,
  value,
  onChange,
}: {
  label: string;
  options: OutputStreamOption[];
  trackType: "Video" | "Audio";
  value: SourceTrackSelection;
  onChange: (value: SourceTrackSelection) => void;
}) {
  const selectedStream = options.find((o) => o.name === value.streamName);
  const tracks = selectedStream?.tracks.filter((t) => t.type === trackType) ?? [];

  return (
    <>
      <label className="field">
        {label} — stream
        <select
          value={value.streamName ?? ""}
          onChange={(e) => onChange({ streamName: e.target.value || null, trackName: null })}
        >
          <option value="">— choose —</option>
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {label} — track
        <select
          value={value.trackName ?? ""}
          onChange={(e) => onChange({ ...value, trackName: e.target.value || null })}
          disabled={!selectedStream}
        >
          <option value="">— choose —</option>
          {tracks.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
