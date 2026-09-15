"use server";

import bcrypt from "bcrypt";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/auth/session";
import { findUserByUsername, touchLastLogin } from "@/db/users";
import { checkLoginLock, recordLoginFailure, recordLoginSuccess } from "@/auth/rateLimit";

export interface LoginState {
  error?: string;
}

// A real bcrypt hash of an arbitrary, never-used password — compared
// against when the username doesn't exist, so bcrypt.compare always runs
// and takes the same time either way (Sprint 2's original timing-safety
// rationale, carried forward now that there's a real user lookup to time).
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8AjNfMv6h/2v6QWNZDwo7Vd9DZG.Sq";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const lockedSeconds = checkLoginLock(username);
  if (lockedSeconds !== null) {
    return { error: `Too many attempts — try again in ${lockedSeconds}s.` };
  }

  const user = findUserByUsername(username);
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    recordLoginFailure(username);
    return { error: "Incorrect username or password." };
  }

  recordLoginSuccess(username);
  touchLastLogin(user.id);

  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    await createSessionToken({ userId: user.id, username: user.username, role: user.role }),
    {
      httpOnly: true,
      // Real deployments only ever get here via NPM's HTTPS, so this should
      // always be true in production. Conditioned on NODE_ENV so `npm run dev`
      // over plain http://localhost:3000 doesn't silently drop the cookie
      // (browsers refuse to store a Secure cookie set over a non-TLS
      // connection) and land you in a confusing "login succeeds, then
      // immediately bounces back to /login" loop.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  );

  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
