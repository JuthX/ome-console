"use client";

import { useEffect, useState } from "react";
import { useLiveSnapshot } from "../_lib/LiveSnapshotProvider";
import { useModalA11y } from "../_lib/useModalA11y";
import type { VhostInfo } from "@/ome-client/types";

const POLL_MS = 5000;

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, "")
    .slice(0, 32);
}

export default function AccessSettingsPage() {
  const snapshot = useLiveSnapshot();
  const [vhost, setVhost] = useState<VhostInfo | null>(null);
  const [admission, setAdmission] = useState<{ allowed: number; denied: number } | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [showRotate, setShowRotate] = useState(false);
  const [newSecret, setNewSecret] = useState("");
  const [reissueMessage, setReissueMessage] = useState<string | null>(null);
  // Gates "Re-issue" behind an explicit, in-the-moment confirmation that the
  // engine is actually reachable — previously this button was always
  // enabled, even if the restart the operator claimed to have done had
  // actually failed (e.g. a typo in Server.xml). This confirms the engine
  // process is back up; it can't confirm the *new* secret specifically is
  // loaded, since the API never exposes which secret is active (redacted
  // since Sprint 8a's own security fix) — stated honestly below, not
  // oversold as more than it is.
  const [engineChecked, setEngineChecked] = useState(false);
  const rotateModal = useModalA11y(showRotate, () => setShowRotate(false));

  useEffect(() => {
    let cancelled = false;
    async function fetchStatus() {
      try {
        const res = await fetch("/api/access-status", { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setStatusError(body.error ?? "Failed to load access status");
          return;
        }
        setStatusError(null);
        setVhost(body.vhost);
        setAdmission(body.admission);
      } catch (err) {
        if (!cancelled) setStatusError(err instanceof Error ? err.message : String(err));
      }
    }
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const signedPolicyOn = !!vhost?.signedPolicy;
  const admissionOn = !!vhost?.admissionWebhooks;

  function openRotate() {
    setNewSecret(randomSecret());
    setReissueMessage(null);
    setEngineChecked(false);
    setShowRotate(true);
  }

  async function handleReissue() {
    try {
      const res = await fetch("/api/viewer-links/reissue", { method: "POST" });
      const body = await res.json();
      if (res.ok) {
        setReissueMessage(`Re-issued ${body.reissued} viewer link(s) with the new secret.`);
      } else {
        setReissueMessage(body.error ?? "Re-issue failed");
      }
    } catch (err) {
      setReissueMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <h1>Access settings</h1>
      <p className="lead">
        Engine-level access control, declared in Server.xml — inspect here, change on disk. Everyday publish keys and
        viewer links are managed on the separate <a href="/access">Publish keys &amp; links</a> page.
      </p>

      {statusError && (
        <div className="pane">
          <span className="chip warn">{statusError}</span>
        </div>
      )}

      <div className="grid2">
        <div className="pane">
          <div className="row">
            <b>Signed policy</b>
            <span className="grow"></span>
            <span className={`sw ro${signedPolicyOn ? " on" : ""}`} />
          </div>
          {signedPolicyOn ? (
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Applies to</dt>
              <dd>play: {vhost!.signedPolicy!.enables.publishers ?? "—"}</dd>
              <dt>Query keys</dt>
              <dd className="mono">
                {vhost!.signedPolicy!.policyQueryKeyName}, {vhost!.signedPolicy!.signatureQueryKeyName}
              </dd>
              <dt>Secret</dt>
              <dd className="mono">
                ••••••••••{" "}
                <button className="btn sm" onClick={openRotate}>
                  Rotate
                </button>
                <span className="sub" style={{ display: "block", fontFamily: "var(--sans)", color: "var(--warn)" }}>
                  Rotating invalidates every issued link; re-issue afterwards.
                </span>
              </dd>
            </dl>
          ) : (
            <p className="lead" style={{ fontSize: 13, marginTop: 10 }}>
              Not enabled — declared in Server.xml, currently off.
            </p>
          )}
        </div>
        <div className="pane">
          <div className="row">
            <b>Admission webhook</b>
            <span className="grow"></span>
            <span className={`sw ro${admissionOn ? " on" : ""}`} />
          </div>
          {admissionOn ? (
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Control URL</dt>
              <dd className="mono">{vhost!.admissionWebhooks!.controlServerUrl}</dd>
              <dt>Timeout</dt>
              <dd className="num">{vhost!.admissionWebhooks!.timeout} ms</dd>
              <dt>Last 5 min</dt>
              <dd>
                {admission?.allowed ?? 0} allowed · {admission?.denied ?? 0} denied
              </dd>
            </dl>
          ) : (
            <p className="lead" style={{ fontSize: 13, marginTop: 10 }}>
              Not enabled — declared in Server.xml, currently off.
            </p>
          )}
        </div>
      </div>
      <p className="note">These two switches are read-only status — declared in Server.xml, not toggleable here.</p>

      {showRotate && (
        <div className="modal-backdrop" onClick={() => setShowRotate(false)}>
          <div className="pane modal" style={{ maxWidth: 560 }} {...rotateModal.panelProps} onClick={(e) => e.stopPropagation()}>
            <h3 id={rotateModal.titleId} style={{ marginTop: 0 }}>
              Rotate SignedPolicy secret
            </h3>
            <p className="lead" style={{ fontSize: 13 }}>
              1. New secret (copy it):
            </p>
            <p>
              <span className="url mono">{newSecret}</span>
            </p>
            <p className="lead" style={{ fontSize: 13 }}>
              2. Update <span className="mono">.env</span>:
            </p>
            <p className="mono" style={{ fontSize: 12 }}>
              SIGNED_POLICY_SECRET={newSecret}
            </p>
            <p className="lead" style={{ fontSize: 13 }}>
              3. Update <span className="mono">ome/conf/Server.xml</span>&apos;s <span className="mono">&lt;SignedPolicy&gt;&lt;SecretKey&gt;</span>{" "}
              to the same value, then restart both containers:
            </p>
            <p className="mono" style={{ fontSize: 12 }}>
              docker compose up -d ome console
            </p>
            <p className="lead" style={{ fontSize: 13 }}>
              4. Confirm the engine actually came back up, then re-issue every stored viewer link with the new
              secret. (This only confirms the engine is reachable again — it can&apos;t confirm it&apos;s specifically
              running the new secret, since that&apos;s never exposed by the API.)
            </p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
              {reissueMessage && <span className="chip">{reissueMessage}</span>}
              {!engineChecked ? (
                <button
                  className="btn"
                  onClick={() => setEngineChecked(!!snapshot?.server?.apiOk)}
                  disabled={!snapshot}
                >
                  Check engine
                </button>
              ) : (
                <span className="chip">engine reachable</span>
              )}
              <button className="btn" onClick={() => setShowRotate(false)}>
                Close
              </button>
              <button className="btn pri" onClick={handleReissue} disabled={!engineChecked}>
                Re-issue links
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
