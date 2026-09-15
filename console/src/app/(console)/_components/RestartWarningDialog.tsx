"use client";

import { useModalA11y } from "../_lib/useModalA11y";

/**
 * PRD §6 #2: "Changing an application or an output profile restarts the app
 * and disconnects every publisher and viewer on it. Every such write
 * carries a blocking confirmation naming the app and the live session
 * count." First real caller: Sprint 6's output profile create/delete and
 * app provider/publisher edits — deliberately not built earlier (Sprint 4a)
 * since nothing restart-causing existed yet.
 */
export function RestartWarningDialog({
  open,
  appName,
  sessionCount,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  appName: string;
  sessionCount: number;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { titleId, panelProps } = useModalA11y(open, onCancel);
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="pane modal" {...panelProps} onClick={(e) => e.stopPropagation()}>
        <h3 id={titleId} style={{ marginTop: 0 }}>
          Restart &quot;{appName}&quot;?
        </h3>
        <div className="note">
          This restarts <span className="mono">{appName}</span> and disconnects every publisher and viewer on it —
          currently <b>{sessionCount}</b> live session{sessionCount === 1 ? "" : "s"}.
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
