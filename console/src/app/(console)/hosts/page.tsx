"use client";

import { Fragment, useEffect, useState } from "react";
import { RestartWarningDialog } from "../_components/RestartWarningDialog";
import type { VhostSummary } from "@/app/api/vhosts/route";
import type { AppInfo, OmeStatsInfo } from "@/ome-client/types";

const POLL_MS = 5000;

interface AppOption {
  vhost: string;
  app: string;
}

const INPUT_ROWS: { key: string; label: string }[] = [
  { key: "srt", label: "SRT" },
  { key: "rtmp", label: "RTMP" },
  { key: "webrtc", label: "WebRTC / WHIP" },
  { key: "rtspPull", label: "RTSP pull" },
  { key: "mpegts", label: "MPEG-TS over UDP" },
  { key: "ovt", label: "OVT (origin ↔ edge)" },
];

const OUTPUT_ROWS: { key: string; label: string }[] = [
  { key: "webrtc", label: "WebRTC" },
  { key: "llhls", label: "LLHLS" },
  { key: "hls", label: "HLS (legacy)" },
  { key: "srt", label: "SRT" },
  { key: "thumbnail", label: "Thumbnails" },
  { key: "ovt", label: "OVT" },
];

export default function HostsPage() {
  const [vhosts, setVhosts] = useState<VhostSummary[]>([]);
  const [vhostsError, setVhostsError] = useState<string | null>(null);
  const [reloadMessage, setReloadMessage] = useState<string | null>(null);

  const [apps, setApps] = useState<AppOption[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppOption | null>(null);
  const [appDetail, setAppDetail] = useState<AppInfo | null>(null);
  const [appStats, setAppStats] = useState<OmeStatsInfo | null>(null);
  const [appError, setAppError] = useState<string | null>(null);

  const [inputToggles, setInputToggles] = useState<Set<string>>(new Set());
  const [outputToggles, setOutputToggles] = useState<Set<string>>(new Set());
  const [confirmSave, setConfirmSave] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/vhosts", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        if (body.vhosts) setVhosts(body.vhosts);
        else setVhostsError(body.error ?? "Failed to load virtual hosts");
      })
      .catch((err) => setVhostsError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    fetch("/api/apps", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        setApps(body.apps ?? []);
        if (body.apps?.length) setSelectedApp(body.apps[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedApp) return;
    let cancelled = false;

    async function fetchDetail() {
      try {
        const res = await fetch(`/api/apps/detail?vhost=${selectedApp!.vhost}&app=${selectedApp!.app}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setAppError(body.error ?? "Failed to load application");
          return;
        }
        setAppError(null);
        setAppDetail(body.app);
        setAppStats(body.stats);
        setInputToggles(new Set(Object.keys(body.app.providers ?? {})));
        setOutputToggles(new Set(Object.keys(body.app.publishers ?? {})));
      } catch (err) {
        if (!cancelled) setAppError(err instanceof Error ? err.message : String(err));
      }
    }

    fetchDetail();
    const id = setInterval(fetchDetail, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedApp]);

  const isDeclared = appDetail?.dynamic === false;
  const sessionCount = appStats?.totalConnections ?? 0;

  async function handleReloadCertificate(vhost: string) {
    setReloadMessage(null);
    try {
      const res = await fetch("/api/vhosts/reload-certificate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vhost }),
      });
      const body = await res.json();
      setReloadMessage(res.ok ? `Reloaded certificate for ${vhost}.` : (body.error ?? "Reload failed"));
    } catch (err) {
      setReloadMessage(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSave() {
    if (!selectedApp) return;
    setSaving(true);
    setSaveError(null);
    try {
      const providers: Record<string, Record<string, unknown>> = {};
      for (const key of inputToggles) providers[key] = appDetail?.providers[key] ?? {};
      const publishers: Record<string, Record<string, unknown>> = {};
      for (const key of outputToggles) publishers[key] = appDetail?.publishers[key] ?? {};

      const res = await fetch("/api/apps", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vhost: selectedApp.vhost, app: selectedApp.app, providers, publishers }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveError(body.error ?? "Failed to save");
        return;
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
      setConfirmSave(false);
    }
  }

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, key: string) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  }

  return (
    <>
      <h1>Hosts &amp; apps</h1>
      <p className="lead">
        Virtual hosts, their TLS and origin settings, and the applications inside them with the inputs they accept
        and outputs they serve. Items declared in Server.xml can be inspected but only changed on disk.
      </p>

      <h2>Virtual hosts</h2>
      {vhostsError ? (
        <div className="pane">
          <span className="chip warn">{vhostsError}</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
          <thead>
            <tr>
              <th>Host</th>
              <th>Names</th>
              <th>TLS</th>
              <th>Apps</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vhosts.map((v) => (
              <tr key={v.name}>
                <td className="mono">{v.name}</td>
                <td>{v.host.names.join(", ")}</td>
                <td>
                  {v.host.tls ? (
                    <>
                      configured
                      <span className="sub">handled by the reverse proxy in this deployment</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{v.apps.join(", ") || "—"}</td>
                <td className="acts">
                  <button className="btn sm" onClick={() => handleReloadCertificate(v.name)}>
                    Reload certificate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
      {reloadMessage && (
        <div className="pane" style={{ marginTop: 10 }}>
          <span className="chip">{reloadMessage}</span>
        </div>
      )}

      {apps.length > 1 && (
        <label className="field" style={{ width: 240, margin: "18px 0 12px" }}>
          Application
          <select
            value={selectedApp ? `${selectedApp.vhost}/${selectedApp.app}` : ""}
            onChange={(e) => {
              const found = apps.find((a) => `${a.vhost}/${a.app}` === e.target.value);
              setSelectedApp(found ?? null);
            }}
          >
            {apps.map((a) => (
              <option key={`${a.vhost}/${a.app}`} value={`${a.vhost}/${a.app}`}>
                {a.vhost}/{a.app}
              </option>
            ))}
          </select>
        </label>
      )}

      {appError ? (
        <div className="pane">
          <span className="chip warn">{appError}</span>
        </div>
      ) : (
        appDetail && (
          <>
            <div className="row" style={{ marginTop: 18 }}>
              <h2 style={{ margin: 0 }}>
                Application: <span className="mono">{appDetail.name}</span>
              </h2>
              {isDeclared && <span className="chip xml">declared in Server.xml</span>}
            </div>
            <div className="grid2">
              <div className="pane">
                <b>Inputs accepted</b>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "8px 12px",
                    marginTop: 10,
                    fontSize: 13,
                  }}
                >
                  {INPUT_ROWS.map((row) => (
                    <Fragment key={row.key}>
                      <span>{row.label}</span>
                      <span
                        className={`sw${isDeclared ? " ro" : ""}${inputToggles.has(row.key) ? " on" : ""}`}
                        onClick={isDeclared ? undefined : () => toggle(inputToggles, setInputToggles, row.key)}
                        {...(isDeclared
                          ? {}
                          : { role: "switch", "aria-checked": inputToggles.has(row.key), "aria-label": row.label })}
                      />
                    </Fragment>
                  ))}
                </div>
              </div>
              <div className="pane">
                <b>Outputs served</b>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "8px 12px",
                    marginTop: 10,
                    fontSize: 13,
                  }}
                >
                  {OUTPUT_ROWS.map((row) => (
                    <Fragment key={row.key}>
                      <span>{row.label}</span>
                      <span
                        className={`sw${isDeclared ? " ro" : ""}${outputToggles.has(row.key) ? " on" : ""}`}
                        onClick={isDeclared ? undefined : () => toggle(outputToggles, setOutputToggles, row.key)}
                        {...(isDeclared
                          ? {}
                          : { role: "switch", "aria-checked": outputToggles.has(row.key), "aria-label": row.label })}
                      />
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
            {isDeclared ? (
              <p className="lead" style={{ fontSize: 13 }}>
                This application is declared in Server.xml — change its providers/publishers on disk and restart
                the container.
              </p>
            ) : (
              <>
                <div className="note">
                  Changing inputs or outputs restarts <span className="mono">{appDetail.name}</span> and
                  disconnects everyone on it.
                </div>
                <div className="row">
                  <span className="grow"></span>
                  {saveError && <span className="chip warn">{saveError}</span>}
                  <button className="btn pri" onClick={() => setConfirmSave(true)} disabled={saving}>
                    Save and restart app
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}

      <RestartWarningDialog
        open={confirmSave}
        appName={selectedApp?.app ?? ""}
        sessionCount={sessionCount}
        confirmLabel="Save and restart"
        onConfirm={handleSave}
        onCancel={() => setConfirmSave(false)}
      />
    </>
  );
}
