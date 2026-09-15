import type { LiveSnapshot } from "@/stats-poller/types";
import type { OmeTrack } from "@/ome-client/types";

export interface OutputStreamOption {
  name: string;
  tracks: OmeTrack[];
}

/** Live output streams (post-profile) for one app — push/record bind to these names (PRD §6 #4). */
export function outputStreamsFor(snapshot: LiveSnapshot | null, vhost: string, app: string): OutputStreamOption[] {
  if (!snapshot) return [];
  const options: OutputStreamOption[] = [];
  for (const stream of snapshot.streams) {
    if (stream.vhost !== vhost || stream.app !== app) continue;
    for (const output of stream.outputs) {
      options.push({ name: output.name, tracks: output.tracks });
    }
  }
  return options;
}
