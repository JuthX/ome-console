import { db } from "./index";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export interface ServerRow {
  id: number;
  name: string;
  api_base_url: string;
  version: string | null;
  last_seen_at: string | null;
  created_at: string;
}

/** Never selects access_token_encrypted — this is the only list surface the API exposes. */
export function listServers(): ServerRow[] {
  return db
    .prepare(`SELECT id, name, api_base_url, version, last_seen_at, created_at FROM servers ORDER BY created_at ASC`)
    .all() as ServerRow[];
}

export function createServer(name: string, apiBaseUrl: string, accessToken: string): ServerRow {
  const result = db
    .prepare(`INSERT INTO servers (name, api_base_url, access_token_encrypted) VALUES (?, ?, ?)`)
    .run(name, apiBaseUrl, encryptSecret(accessToken));
  return db
    .prepare(`SELECT id, name, api_base_url, version, last_seen_at, created_at FROM servers WHERE id = ?`)
    .get(result.lastInsertRowid) as ServerRow;
}

export function deleteServer(id: number): void {
  db.prepare(`DELETE FROM servers WHERE id = ?`).run(id);
}

export function getServerConnection(id: number): { apiBaseUrl: string; accessToken: string } | undefined {
  const row = db.prepare(`SELECT api_base_url, access_token_encrypted FROM servers WHERE id = ?`).get(id) as
    | { api_base_url: string; access_token_encrypted: string }
    | undefined;
  if (!row) return undefined;
  return { apiBaseUrl: row.api_base_url, accessToken: decryptSecret(row.access_token_encrypted) };
}

export function touchServerSeen(id: number, version: string): void {
  db.prepare(`UPDATE servers SET version = ?, last_seen_at = datetime('now') WHERE id = ?`).run(version, id);
}
