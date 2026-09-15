import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

// Bind-mounted (see docker-compose.yml) so the file survives container
// recreation, not baked into the image or a named volume.
const DATABASE_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "console.sqlite");

declare global {
  var __consoleDb: Database.Database | undefined;
}

function openDatabase(): Database.Database {
  // Sprint 4: `next build`'s page-data-collection step now imports this
  // module transitively (a route handler touches @/db), inside the Docker
  // builder stage where the bind-mounted data/ directory doesn't exist yet
  // (deliberately excluded from the build context via .dockerignore) —
  // better-sqlite3 creates the file but not missing parent directories.
  fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
  // Sprint 6: `next build`'s page-data-collection step runs multiple worker
  // *processes* in parallel, and enough routes now import @/db (transitively,
  // via writeAudit) that several of them open this same fresh file at once —
  // a real SQLITE_BUSY under WAL mode, not just a theoretical one. A busy
  // timeout (retry internally instead of failing immediately) fixes the
  // build and is generally good practice for a multi-connection SQLite
  // server regardless.
  const db = new Database(DATABASE_PATH, { timeout: 5000 });
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  // Holds bcrypt hashes and encrypted server-registry tokens — tighten to
  // owner-only regardless of the process umask, so a fresh install doesn't
  // default to a world-readable 644 (the WAL/SHM sidecar files better-sqlite3
  // creates alongside it get the same umask-derived mode, so cover those too).
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${DATABASE_PATH}${suffix}`;
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
  }
  return db;
}

// Next.js dev mode can re-evaluate this module on hot reload; cache on
// globalThis so we don't reopen the file (and re-run schema) every time.
export const db = globalThis.__consoleDb ?? openDatabase();
if (process.env.NODE_ENV !== "production") {
  globalThis.__consoleDb = db;
}
