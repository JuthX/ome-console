"use client";

import { createContext, useContext, useState } from "react";

interface MobileNavContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null);

// The sidebar nav is hidden entirely below 900px (globals.css) with nothing
// to bring it back — this is that "bring it back" affordance: a hamburger
// button (TopBar) toggling an overlay (Sidebar), mirroring DrawerProvider's
// shape since it's the same "one shared open/close flag" pattern.
export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <MobileNavContext.Provider
      value={{
        open,
        toggle: () => setOpen((v) => !v),
        close: () => setOpen(false),
      }}
    >
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavContextValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) throw new Error("useMobileNav must be used within MobileNavProvider");
  return ctx;
}
