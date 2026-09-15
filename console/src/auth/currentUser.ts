import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionData } from "./session";

/** The logged-in user for the current request, from the session cookie. Node runtime only (route handlers, server actions) — proxy.ts reads the cookie itself instead, since it can't use `next/headers`. */
export async function getCurrentUser(): Promise<SessionData | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function getCurrentUsername(): Promise<string> {
  const user = await getCurrentUser();
  return user?.username ?? "unknown";
}
