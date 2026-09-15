"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/auth/roles";

export interface CurrentUser {
  username: string;
  role: Role;
}

const CurrentUserContext = createContext<CurrentUser | null>(null);

// Seeded from the server-verified session in the layout (server component),
// not re-fetched client-side — the role/username here is exactly what
// proxy.ts already authorized this request against, so it can't drift from
// what the user is actually allowed to do this page-load.
export function CurrentUserProvider({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUser {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) throw new Error("useCurrentUser must be used within CurrentUserProvider");
  return ctx;
}
