"use client";

import { useEffect, useId, useRef, type KeyboardEvent } from "react";

/**
 * Shared accessibility wiring for this app's modal-backdrop/pane.modal
 * dialogs — none of them (ConfirmDialog, RestartWarningDialog, and the two
 * ad-hoc ones in access/page.tsx and access-settings/page.tsx) had any
 * dialog semantics, focus management, or Escape-to-close before this.
 * Spread `panelProps` onto the `pane modal` div and set `id={titleId}` on
 * its `<h3>` — every one of the four dialogs shares that exact DOM shape.
 */
export function useModalA11y(open: boolean, onCancel: () => void) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const panelProps = {
    ref: panelRef,
    role: "dialog" as const,
    "aria-modal": true,
    "aria-labelledby": titleId,
    tabIndex: -1,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    },
  };

  return { titleId, panelProps };
}
