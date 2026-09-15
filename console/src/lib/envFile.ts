import fs from "node:fs";

// The setup wizard writes real config into the same .env file
// docker-compose.yml reads at container start (bind-mounted read-write at
// /app/.env, see ENV_FILE_PATH) — this is the *only* writer of that file
// from inside the app, and it's line-oriented on purpose: every comment
// and section header a self-hoster sees in .env.example is preserved
// untouched, only the specific `KEY=` lines the wizard owns are replaced
// (or appended, for a from-scratch .env that never had them).
const ENV_FILE_PATH = process.env.ENV_FILE_PATH ?? "/app/.env";

function readLines(): string[] {
  if (!fs.existsSync(ENV_FILE_PATH)) return [];
  return fs.readFileSync(ENV_FILE_PATH, "utf8").split("\n");
}

/** Parsed KEY=value pairs, ignoring comments/blank lines — read-only view. */
export function readEnvFile(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of readLines()) {
    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

/**
 * Sets one or more KEY=value lines in place, preserving every other line
 * (comments, blank lines, unrelated vars) exactly as-is. Keys not already
 * present as a real `KEY=...` line are appended under a wizard-owned
 * section at the end, only created once.
 */
export function writeEnvValues(values: Record<string, string>): void {
  const lines = readLines();
  const remaining = new Map(Object.entries(values));

  const updated = lines.map((line) => {
    const match = /^([A-Z_][A-Z0-9_]*)=/.exec(line);
    if (match && remaining.has(match[1])) {
      const key = match[1];
      const value = remaining.get(key)!;
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });

  if (remaining.size > 0) {
    const header = "### Added by the setup wizard ###";
    if (!updated.includes(header)) {
      if (updated.length > 0 && updated[updated.length - 1] !== "") updated.push("");
      updated.push(header);
    }
    for (const [key, value] of remaining) updated.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_FILE_PATH, updated.join("\n"), { mode: 0o600 });
  fs.chmodSync(ENV_FILE_PATH, 0o600);
}
