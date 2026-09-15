"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import type { KeyPreset } from "@/db/types";

const POLL_MS = 5000;

interface AppOption {
  vhost: string;
  app: string;
}

interface KeyRow {
  id: number;
  stream_name: string;
  protocol: string;
  holder: string;
  expires_at: string | null;
  revoked: number;
  last_used_at: string | null;
  created_at: string;
  url: string;
}

interface ViewerLinkRow {
  id: number;
  stream_name: string;
  protocol: string;
  url: string;
  expires_at: string | null;
  created_at: string;
}

/** For prefilling a preset's saved expiry duration back into the datetime-local input. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AccessPage() {
  const [apps, setApps] = useState<AppOption[]>([]);

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyStream, setKeyStream] = useState("");
  const [keyProtocol, setKeyProtocol] = useState("rtmp");
  const [keyHolder, setKeyHolder] = useState("");
  const [keyExpiry, setKeyExpiry] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<KeyRow | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<KeyRow | null>(null);
  const [qrFor, setQrFor] = useState<{ label: string; dataUrl: string } | null>(null);

  const [presets, setPresets] = useState<KeyPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [confirmDeletePreset, setConfirmDeletePreset] = useState<KeyPreset | null>(null);

  const [links, setLinks] = useState<ViewerLinkRow[]>([]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkApp, setLinkApp] = useState("");
  const [linkStream, setLinkStream] = useState("");
  const [linkFormat, setLinkFormat] = useState("webrtc");
  const [linkValidFor, setLinkValidFor] = useState("4h");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [confirmDeleteLink, setConfirmDeleteLink] = useState<ViewerLinkRow | null>(null);

  useEffect(() => {
    fetch("/api/apps", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        setApps(body.apps ?? []);
        if (body.apps?.length) setLinkApp(body.apps[0].app);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function fetchKeys() {
      fetch("/api/keys", { cache: "no-store" })
        .then((res) => res.json())
        .then((body) => setKeys(body.keys ?? []))
        .catch(() => {});
    }
    fetchKeys();
    const id = setInterval(fetchKeys, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/key-presets", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setPresets(body.presets ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function fetchLinks() {
      fetch("/api/viewer-links", { cache: "no-store" })
        .then((res) => res.json())
        .then((body) => setLinks(body.links ?? []))
        .catch(() => {});
    }
    fetchLinks();
    const id = setInterval(fetchLinks, POLL_MS);
    return () => clearInterval(id);
  }, []);

  async function handleCreateKey() {
    if (!keyStream || !keyHolder) return;
    setKeyError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream_name: keyStream,
          protocol: keyProtocol,
          holder: keyHolder,
          // `datetime-local`'s value has no timezone — convert from the
          // browser's local time to a real instant before sending, so the
          // API's SQLite-comparable normalization is working from the
          // actual UTC moment intended, not a naive local-time string.
          expires_at: keyExpiry ? new Date(keyExpiry).toISOString() : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setKeyError(body.error ?? "Failed to create key");
        return;
      }
      setKeys((prev) => [body.key, ...prev]);
      setKeyStream("");
      setKeyHolder("");
      setKeyExpiry("");
      setShowKeyForm(false);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    }
  }

  function applyKeyPreset(id: string) {
    const preset = presets.find((p) => String(p.id) === id);
    if (!preset) return;
    setKeyProtocol(preset.protocol);
    setKeyExpiry(
      preset.expires_in_hours != null ? toDatetimeLocalValue(new Date(Date.now() + preset.expires_in_hours * 3600_000)) : "",
    );
  }

  async function handleSaveKeyPreset() {
    if (!presetName) return;
    setKeyError(null);
    try {
      const expiresInHours = keyExpiry
        ? Math.max(1, Math.round((new Date(keyExpiry).getTime() - Date.now()) / 3600_000))
        : null;
      const res = await fetch("/api/key-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: presetName, protocol: keyProtocol, expires_in_hours: expiresInHours }),
      });
      const body = await res.json();
      if (!res.ok) {
        setKeyError(body.error ?? "Failed to save preset");
        return;
      }
      setPresets((prev) => [body.preset, ...prev]);
      setPresetName("");
      setShowSavePreset(false);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRevoke(key: KeyRow) {
    try {
      await fetch("/api/keys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: key.id }),
      });
      setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, revoked: 1 } : k)));
    } finally {
      setConfirmRevoke(null);
    }
  }

  async function handleDeleteKey(key: KeyRow) {
    try {
      await fetch(`/api/keys?id=${key.id}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
    } finally {
      setConfirmDeleteKey(null);
    }
  }

  async function handleDeletePreset(preset: KeyPreset) {
    try {
      await fetch(`/api/key-presets?id=${preset.id}`, { method: "DELETE" });
      setPresets((prev) => prev.filter((p) => p.id !== preset.id));
    } finally {
      setConfirmDeletePreset(null);
    }
  }

  async function handleDeleteLink(link: ViewerLinkRow) {
    try {
      await fetch(`/api/viewer-links?id=${link.id}`, { method: "DELETE" });
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
    } finally {
      setConfirmDeleteLink(null);
    }
  }

  async function handleShowQr(label: string, text: string) {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(text);
    setQrFor({ label, dataUrl });
  }

  async function handleGenerateLink() {
    if (!linkApp || !linkStream) return;
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/viewer-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: linkApp, stream_name: linkStream, format: linkFormat, valid_for: linkValidFor }),
      });
      const body = await res.json();
      if (!res.ok) {
        setLinkError(body.error ?? "Failed to generate link");
        return;
      }
      setLinks((prev) => [body.link, ...prev]);
      setLinkStream("");
      setShowLinkForm(false);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setLinkSubmitting(false);
    }
  }

  return (
    <>
      <h1>Publish keys &amp; links</h1>
      <p className="lead">
        Who may publish and who may watch. One key per device or crew member, enforced live through the admission
        webhook; signed links for viewers. Engine-level access settings (Signed policy, Admission webhooks) live on
        the separate <a href="/access-settings">Access settings</a> page.
      </p>

      <div className="row" style={{ marginTop: 6, marginBottom: 10 }}>
        <span className="lead" style={{ margin: 0, fontSize: 13 }}>
          The plain link opens directly in Larix or OBS; the admission webhook gates it live.
        </span>
        <span className="grow"></span>
        <button className="btn pri" onClick={() => setShowKeyForm((v) => !v)}>
          New key
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Stream</th>
            <th>Protocol</th>
            <th>Expires</th>
            <th>Last used</th>
            <th>Link</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id}>
              <td>{k.holder}</td>
              <td className="mono">{k.stream_name}</td>
              <td>{k.protocol.toUpperCase()}</td>
              <td>{k.expires_at ?? "never"}</td>
              <td>{k.last_used_at ?? "never"}</td>
              <td>
                <span className="url">{k.url}</span>
              </td>
              <td className="acts">
                {k.revoked ? (
                  <span className="chip off">revoked</span>
                ) : (
                  <>
                    <button className="btn sm" onClick={() => navigator.clipboard.writeText(k.url)}>
                      Copy
                    </button>
                    <button className="btn sm" onClick={() => handleShowQr(k.holder, k.url)}>
                      QR
                    </button>
                    <button className="btn sm danger" onClick={() => setConfirmRevoke(k)}>
                      Revoke
                    </button>
                  </>
                )}
                <button className="btn sm danger" onClick={() => setConfirmDeleteKey(k)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showKeyForm && (
        <div className="pane" style={{ marginTop: 12 }}>
          {presets.length > 0 && (
            <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              <label className="field" style={{ width: 240 }}>
                Load preset
                <select defaultValue="" onChange={(e) => applyKeyPreset(e.target.value)}>
                  <option value="">— choose a preset —</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {presets.map((p) => (
                <span key={p.id} className="chip" style={{ alignSelf: "flex-end" }}>
                  {p.name}
                  <button
                    className="btn sm"
                    style={{ padding: "0 4px", marginLeft: 4 }}
                    onClick={() => setConfirmDeletePreset(p)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="grid3">
            <label className="field">
              Holder
              <input value={keyHolder} onChange={(e) => setKeyHolder(e.target.value)} placeholder="e.g. Anna · iPhone 15" />
            </label>
            <label className="field">
              Stream
              <input className="mono" value={keyStream} onChange={(e) => setKeyStream(e.target.value)} placeholder="e.g. phone1" />
            </label>
            <label className="field">
              Protocol
              <select value={keyProtocol} onChange={(e) => setKeyProtocol(e.target.value)}>
                <option value="rtmp">RTMP</option>
                <option value="srt">SRT</option>
              </select>
            </label>
            <label className="field">
              Expires (optional)
              <input type="datetime-local" value={keyExpiry} onChange={(e) => setKeyExpiry(e.target.value)} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {showSavePreset ? (
              <>
                <input
                  style={{ width: 180 }}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="preset name"
                />
                <button className="btn sm pri" onClick={handleSaveKeyPreset} disabled={!presetName}>
                  Save
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => setShowSavePreset(true)}>
                Save protocol/expiry as preset
              </button>
            )}
            <span className="grow"></span>
            {keyError && <span className="chip warn">{keyError}</span>}
            <button className="btn pri" onClick={handleCreateKey} disabled={!keyStream || !keyHolder}>
              Create key
            </button>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 24, marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Viewer links</h2>
        <span className="grow"></span>
        <button className="btn pri" onClick={() => setShowLinkForm((v) => !v)}>
          New viewer link
        </button>
      </div>

      {showLinkForm && (
        <div className="pane">
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              App
              <select value={linkApp} onChange={(e) => setLinkApp(e.target.value)}>
                {apps.map((a) => (
                  <option key={`${a.vhost}/${a.app}`} value={a.app}>
                    {a.app}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              Stream
              <input className="mono" value={linkStream} onChange={(e) => setLinkStream(e.target.value)} placeholder="e.g. vmix-program" />
            </label>
            <label className="field" style={{ flex: 1 }}>
              Format
              <select value={linkFormat} onChange={(e) => setLinkFormat(e.target.value)}>
                <option value="webrtc">WebRTC</option>
                <option value="llhls">LLHLS</option>
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              Valid for
              <select value={linkValidFor} onChange={(e) => setLinkValidFor(e.target.value)}>
                <option value="4h">4 hours</option>
                <option value="show">Show (12h)</option>
                <option value="none">No expiry</option>
              </select>
            </label>
            <button className="btn pri" style={{ alignSelf: "flex-end" }} onClick={handleGenerateLink} disabled={linkSubmitting || !linkStream}>
              Generate signed link
            </button>
          </div>
          {linkError && (
            <p style={{ marginTop: 10 }}>
              <span className="chip warn">{linkError}</span>
            </p>
          )}
        </div>
      )}

      {links.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Stream</th>
              <th>Format</th>
              <th>Expires</th>
              <th>Link</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.stream_name}</td>
                <td>{l.protocol.toUpperCase()}</td>
                <td>{l.expires_at ?? "never"}</td>
                <td>
                  <span className="url">{l.url}</span>
                </td>
                <td className="acts">
                  <button className="btn sm" onClick={() => navigator.clipboard.writeText(l.url)}>
                    Copy
                  </button>
                  <button className="btn sm danger" onClick={() => setConfirmDeleteLink(l)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ConfirmDialog
        open={confirmRevoke !== null}
        title="Revoke key?"
        message={`"${confirmRevoke?.holder}" will no longer be able to publish to "${confirmRevoke?.stream_name}".`}
        confirmLabel="Revoke"
        onConfirm={() => confirmRevoke && handleRevoke(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
      />

      <ConfirmDialog
        open={confirmDeleteKey !== null}
        title="Delete key?"
        message={`"${confirmDeleteKey?.holder}" will be permanently removed from the list.`}
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteKey && handleDeleteKey(confirmDeleteKey)}
        onCancel={() => setConfirmDeleteKey(null)}
      />

      <ConfirmDialog
        open={confirmDeletePreset !== null}
        title="Delete preset?"
        message={`"${confirmDeletePreset?.name}" will be permanently removed.`}
        confirmLabel="Delete"
        onConfirm={() => confirmDeletePreset && handleDeletePreset(confirmDeletePreset)}
        onCancel={() => setConfirmDeletePreset(null)}
      />

      <ConfirmDialog
        open={confirmDeleteLink !== null}
        title="Delete viewer link?"
        message={`The link for "${confirmDeleteLink?.stream_name}" will stop being tracked here — it may still work until it expires, since OME verifies signed links itself.`}
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteLink && handleDeleteLink(confirmDeleteLink)}
        onCancel={() => setConfirmDeleteLink(null)}
      />

      {qrFor && (
        <div className="modal-backdrop" onClick={() => setQrFor(null)}>
          <div className="pane modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{qrFor.label}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, not a static asset */}
            <img src={qrFor.dataUrl} alt="QR code" style={{ width: "100%" }} />
          </div>
        </div>
      )}
    </>
  );
}
