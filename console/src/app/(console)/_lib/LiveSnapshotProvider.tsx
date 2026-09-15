"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { LiveSnapshot } from "@/stats-poller/types";

const LiveSnapshotContext = createContext<LiveSnapshot | null>(null);

/**
 * One EventSource for the whole authenticated app shell — every page reads
 * from this instead of opening its own connection to /api/live.
 */
export function LiveSnapshotProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/live");
    sourceRef.current = source;
    source.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data) as LiveSnapshot);
    };
    // Without this, a dead connection (session expired, network blip, the
    // proxy having a bad day) leaves every page silently rendering the last
    // snapshot forever — the browser's EventSource keeps retrying in the
    // background, but nothing tells the UI the data on screen has gone
    // stale. Drop back to null ("Connecting…") so that's visible; a
    // reconnect's first message replaces it same as on first load.
    source.onerror = () => setSnapshot(null);
    return () => source.close();
  }, []);

  return <LiveSnapshotContext.Provider value={snapshot}>{children}</LiveSnapshotContext.Provider>;
}

/** Null until the first SSE message arrives (typically well under a second). */
export function useLiveSnapshot(): LiveSnapshot | null {
  return useContext(LiveSnapshotContext);
}
