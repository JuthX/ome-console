import { open, stat } from "node:fs/promises";
import { NextRequest } from "next/server";

const MAX_LINES = 500;

// Generous headroom over MAX_LINES=500 real entries even accounting for
// OME's verbose multi-line HTTP debug dumps — read only this many bytes
// from the end of the file instead of the whole thing. Without this, the
// Logs page's 3s poll (logs/page.tsx) does a full-file read/split/group
// pass every tick with no cap on input size — fine at today's ~130KB, but
// genuinely unbounded over time since no log rotation is configured
// (ome/conf/Logger.xml has no rotation directives).
const TAIL_BYTES = 256 * 1024;

// A real entry starts with OME's own timestamp; anything else (its HTTP
// debug dumps emit unprefixed [Headers]/[Client]/[Request]/[Response]
// continuation lines, verified against a real log) belongs to the entry
// above it. Without this, a filter match can lose the rest of its block,
// level-detection sees a continuation line as its own untagged "info" line,
// and the MAX_LINES cutoff can split a block in half.
const ENTRY_START = /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+\]/;

function groupEntries(rawLines: string[]): string[] {
  const entries: string[] = [];
  for (const line of rawLines) {
    if (ENTRY_START.test(line) || entries.length === 0) {
      entries.push(line);
    } else {
      entries[entries.length - 1] += "\n" + line;
    }
  }
  return entries;
}

export async function GET(req: NextRequest) {
  const logPath = process.env.OME_LOG_PATH;
  if (!logPath) {
    return Response.json({ lines: [], error: "OME_LOG_PATH is not configured" }, { status: 500 });
  }

  const filter = req.nextUrl.searchParams.get("filter")?.toLowerCase() ?? "";

  let content: string;
  let seeked: boolean;
  try {
    const { size } = await stat(logPath);
    const start = Math.max(0, size - TAIL_BYTES);
    seeked = start > 0;
    const handle = await open(logPath, "r");
    try {
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      content = buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch (err) {
    return Response.json({ lines: [], error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const rawLines = content.split("\n").filter(Boolean);
  // Only when we actually seeked mid-file is a non-entry-start first line
  // a truncated fragment of the entry before our read window — drop it
  // rather than show a corrupted partial entry. On a full-file read (file
  // smaller than TAIL_BYTES) a malformed real first line should stay.
  if (seeked && rawLines.length > 0 && !ENTRY_START.test(rawLines[0])) rawLines.shift();

  const entries = groupEntries(rawLines);
  const filtered = filter ? entries.filter((entry) => entry.toLowerCase().includes(filter)) : entries;

  return Response.json({ lines: filtered.slice(-MAX_LINES), totalMatching: filtered.length });
}
