import { db } from "./index";
import type { Role } from "@/auth/roles";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  created_at: string;
  last_login_at: string | null;
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRow | undefined;
}

export function countUsers(): number {
  return (db.prepare(`SELECT COUNT(*) as n FROM users`).get() as { n: number }).n;
}

export function listUsers(): Omit<UserRow, "password_hash">[] {
  return db
    .prepare(`SELECT id, username, role, created_at, last_login_at FROM users ORDER BY created_at ASC`)
    .all() as Omit<UserRow, "password_hash">[];
}

export function createUser(username: string, passwordHash: string, role: Role): UserRow {
  const result = db
    .prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`)
    .run(username, passwordHash, role);
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(result.lastInsertRowid) as UserRow;
}

export function deleteUser(id: number): void {
  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
}

export function touchLastLogin(id: number): void {
  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(id);
}

export function updatePasswordHash(id: number, passwordHash: string): void {
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, id);
}

/**
 * One-time migration (idempotent — only runs while the table is empty):
 * carries the Sprint 2 single-admin login (CONSOLE_ADMIN_USER/
 * CONSOLE_ADMIN_PASSWORD_HASH env vars) forward as the first real user,
 * with the Engineer role (the superset of every permission the old
 * hardcoded admin login implicitly had) — no forced password reset.
 */
export function seedFirstUserFromEnv(): void {
  if (countUsers() > 0) return;

  const username = process.env.CONSOLE_ADMIN_USER;
  const passwordHash = process.env.CONSOLE_ADMIN_PASSWORD_HASH;
  if (!username || !passwordHash) {
    // Otherwise a misconfigured deployment (env vars forgotten) is silently
    // indistinguishable from a wrong password at the login screen — every
    // attempt just gets "Incorrect username or password" with no signal
    // anywhere that the real problem is an empty `users` table.
    console.warn(
      "seedFirstUserFromEnv: users table is empty and CONSOLE_ADMIN_USER/CONSOLE_ADMIN_PASSWORD_HASH are not " +
        "both set — no user was seeded. Login will fail for everyone until a user exists.",
    );
    return;
  }

  createUser(username, passwordHash, "engineer");
  console.log(`seedFirstUserFromEnv: seeded first user "${username}" (engineer) from CONSOLE_ADMIN_USER.`);
}
