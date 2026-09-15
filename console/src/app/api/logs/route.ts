import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";

const MAX_LINES = 500;

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
  try {
    content = await readFile(logPath, "utf8");
  } catch (err) {
    return Response.json({ lines: [], error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const entries = groupEntries(content.split("\n").filter(Boolean));
  const filtered = filter ? entries.filter((entry) => entry.toLowerCase().includes(filter)) : entries;

  return Response.json({ lines: filtered.slice(-MAX_LINES), totalMatching: filtered.length });
}
