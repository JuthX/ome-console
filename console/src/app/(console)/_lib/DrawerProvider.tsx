"use client";

import { createContext, useContext, useState } from "react";

export interface StreamKey {
  vhost: string;
  app: string;
  name: string;
}

interface DrawerContextValue {
  open: StreamKey | null;
  openDrawer: (key: StreamKey) => void;
  closeDrawer: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

// One drawer instance, mounted once in the layout, opened from wherever a
// stream is clickable (Multiviewer tiles, Streams table rows) — per the
// plan's note that the drawer is a cross-cutting component, not tied to
// one page.
export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<StreamKey | null>(null);

  return (
    <DrawerContext.Provider
      value={{
        open,
        openDrawer: setOpen,
        closeDrawer: () => setOpen(null),
      }}
    >
      {children}
    </DrawerContext.Provider>
  );
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used within DrawerProvider");
  return ctx;
}
