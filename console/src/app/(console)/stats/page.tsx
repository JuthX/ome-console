"use client";

import { useEffect, useState } from "react";
import { useLiveSnapshot } from "../_lib/LiveSnapshotProvider";
import { useCurrentUser } from "../_lib/CurrentUserProvider";
import { hasRole } from "@/auth/roles";
import { formatBitrate } from "../_lib/format";
import type { RuleName, RuleStatus } from "@/alerts";

const PROTOCOL_LABELS: Record<string, string> = {
  webrtc: "WebRTC",
  llhls: "LLHLS",
  hlsv3: "HLS",
  srt: "SRT",
  push: "Push",
  ovt: "OVT",
  thumbnail: "Thumbnail",
};

interface AlertRoute {
  id: number;
  rule_name: string;
  channel: string;
  target: string;
  enabled: number;
}

type RuleWithRoutes = RuleStatus & { routes: AlertRoute[] };

const ALERTS_POLL_MS = 5000;

export default function StatsPage() {
  const snapshot = useLiveSnapshot();
  const server = snapshot?.server;
  const { role } = useCurrentUser();
  // Managing routing (/api/alert-routes) is Engineer-only in proxy.ts —
  // the add/delete controls below must match that, not just rely on the
  // API to reject a lower role after the fact.
  const canManageRoutes = hasRole(role, "engineer");

  const [rules, setRules] = useState<RuleWithRoutes[]>([]);
  const [addingRouteFor, setAddingRouteFor] = useState<RuleName | null>(null);
  const [newRouteEmail, setNewRouteEmail] = useState("");
  const [routeError, setRouteError] = useState<string | null>(null);

  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMessage, setSmtpMessage] = useState<string | null>(null);
  const [smtpTestTo, setSmtpTestTo] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestMessage, setSmtpTestMessage] = useState<string | null>(null);

  useEffect(() => {
    function fetchAlerts() {
      fetch("/api/alerts", { cache: "no-store" })
        .then((res) => res.json())
        .then((body) => setRules(body.rules ?? []))
        .catch(() => {});
    }
    fetchAlerts();
    const id = setInterval(fetchAlerts, ALERTS_POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!canManageRoutes) return;
    fetch("/api/smtp", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        setSmtpHost(body.host ?? "");
        setSmtpPort(body.port ?? "587");
        setSmtpUser(body.user ?? "");
        setSmtpFrom(body.from ?? "");
        setSmtpPasswordSet(!!body.passwordSet);
      })
      .catch(() => {});
  }, [canManageRoutes]);

  async function handleSaveSmtp() {
    setSmtpSaving(true);
    setSmtpMessage(null);
    try {
      const res = await fetch("/api/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: smtpHost, port: smtpPort, user: smtpUser, password: smtpPassword, from: smtpFrom }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSmtpMessage(body.error ?? "Failed to save");
        return;
      }
      if (smtpPassword) setSmtpPasswordSet(true);
      setSmtpPassword("");
      setSmtpMessage("Saved — takes effect immediately, no restart needed.");
    } catch (err) {
      setSmtpMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSmtpSaving(false);
    }
  }

  async function handleSendTestEmail() {
    if (!smtpTestTo) return;
    setSmtpTesting(true);
    setSmtpTestMessage(null);
    try {
      const res = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: smtpTestTo }),
      });
      const body = await res.json();
      setSmtpTestMessage(body.ok ? `Sent to ${smtpTestTo}.` : (body.error ?? "Failed to send"));
    } catch (err) {
      setSmtpTestMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSmtpTesting(false);
    }
  }

  async function handleAddRoute(ruleName: RuleName) {
    if (!newRouteEmail) return;
    setRouteError(null);
    try {
      const res = await fetch("/api/alert-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule_name: ruleName, channel: "email", target: newRouteEmail }),
      });
      const body = await res.json();
      if (!res.ok) {
        setRouteError(body.error ?? "Failed to add route");
        return;
      }
      setRules((prev) =>
        prev.map((r) => (r.name === ruleName ? { ...r, routes: [...r.routes, body.route] } : r)),
      );
      setNewRouteEmail("");
      setAddingRouteFor(null);
    } catch (err) {
      setRouteError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteRoute(ruleName: RuleName, routeId: number) {
    const res = await fetch(`/api/alert-routes?id=${routeId}`, { method: "DELETE" });
    if (!res.ok) {
      setRouteError("Failed to remove route");
      return;
    }
    setRules((prev) =>
      prev.map((r) => (r.name === ruleName ? { ...r, routes: r.routes.filter((rt) => rt.id !== routeId) } : r)),
    );
  }

  const sessionsByProtocol = (snapshot?.streams ?? []).reduce<Record<string, number>>((acc, stream) => {
    for (const [key, count] of Object.entries(stream.connections)) {
      acc[key] = (acc[key] ?? 0) + count;
    }
    return acc;
  }, {});

  return (
    <>
      <h1>Statistics & alerts</h1>
      <p className="lead">Server, host, app and stream counters from the engine, plus the alert rules it evaluates.</p>

      {!snapshot ? (
        <p className="lead">Connecting…</p>
      ) : (
        <>
          <div className="grid3">
            <div className="pane">
              <div className="stat">
                {server ? formatBitrate(server.throughputIn) : "—"}
                <small>throughput in</small>
              </div>
            </div>
            <div className="pane">
              <div className="stat">
                {server ? formatBitrate(server.throughputOut) : "—"}
                <small>throughput out</small>
              </div>
            </div>
            <div className="pane">
              <div className="stat">
                {server?.totalSessions ?? "—"}
                <small>total sessions</small>
              </div>
            </div>
          </div>

          <h2>Sessions by protocol</h2>
          <div className="pane">
            <div className="row" style={{ flexWrap: "wrap", gap: "12px" }}>
              {Object.entries(sessionsByProtocol).map(([key, count]) => (
                <span key={key} className="chip">
                  {PROTOCOL_LABELS[key] ?? key} <b className="num">{count}</b>
                </span>
              ))}
              {Object.keys(sessionsByProtocol).length === 0 && (
                <span className="lead" style={{ margin: 0 }}>
                  No active sessions.
                </span>
              )}
            </div>
          </div>

          <h2>Live streams</h2>
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th>Stream</th>
                <th>Bitrate in</th>
                <th>Total connections</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.streams.map((stream) => (
                <tr key={`${stream.vhost}/${stream.app}/${stream.name}`}>
                  <td className="mono">{stream.name}</td>
                  <td className="mono">{formatBitrate(stream.bitrateIn)}</td>
                  <td className="mono">{stream.totalConnections}</td>
                </tr>
              ))}
              {snapshot.streams.length === 0 && (
                <tr>
                  <td colSpan={3} className="sub">
                    No streams are live right now.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>

          <h2>Alert rules</h2>
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Condition</th>
                <th>Notify</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.name}>
                  <td>{rule.label}</td>
                  <td>{rule.condition}</td>
                  <td>
                    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                      {rule.routes.map((route) => (
                        <span key={route.id} className="chip">
                          {canManageRoutes ? route.target : "email configured"}
                          {canManageRoutes && (
                            <button
                              className="btn sm"
                              style={{ padding: "0 4px", marginLeft: 4 }}
                              onClick={() => handleDeleteRoute(rule.name, route.id)}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                      {canManageRoutes &&
                        (addingRouteFor === rule.name ? (
                          <span className="row" style={{ gap: 6 }}>
                            <input
                              style={{ width: 180 }}
                              value={newRouteEmail}
                              onChange={(e) => setNewRouteEmail(e.target.value)}
                              placeholder="ops@example.com"
                            />
                            <button className="btn sm pri" onClick={() => handleAddRoute(rule.name)}>
                              Add
                            </button>
                          </span>
                        ) : (
                          <button className="btn sm" onClick={() => setAddingRouteFor(rule.name)}>
                            + email
                          </button>
                        ))}
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${rule.firing ? "warn" : "off"}`}>
                      {rule.firing ? `firing · ${rule.firingTarget}` : "ok"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          {routeError && (
            <p style={{ marginTop: 10 }}>
              <span className="chip warn">{routeError}</span>
            </p>
          )}

          {canManageRoutes && (
            <>
              <h2>Email (SMTP)</h2>
              <p className="lead" style={{ fontSize: 13 }}>
                Used to send the alert emails routed above. Set once during initial setup — change or add it here
                any time; unlike most settings, this one applies immediately, no restart needed.
              </p>
              <div className="pane">
                <div className="grid3">
                  <label className="field">
                    SMTP host
                    <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
                  </label>
                  <label className="field">
                    Port
                    <input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
                  </label>
                  <label className="field">
                    Username
                    <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                  </label>
                  <label className="field">
                    Password
                    <input
                      type="password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder={smtpPasswordSet ? "unchanged — leave blank to keep it" : ""}
                    />
                  </label>
                  <label className="field">
                    From address
                    <input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="alerts@example.com" />
                  </label>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  <span className="grow"></span>
                  {smtpMessage && <span className="chip">{smtpMessage}</span>}
                  <button className="btn pri" onClick={handleSaveSmtp} disabled={smtpSaving}>
                    {smtpSaving ? "Saving…" : "Save"}
                  </button>
                </div>
                <div className="row" style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <input
                    style={{ width: 220 }}
                    value={smtpTestTo}
                    onChange={(e) => setSmtpTestTo(e.target.value)}
                    placeholder="send a test to…"
                  />
                  <button className="btn sm" onClick={handleSendTestEmail} disabled={smtpTesting || !smtpTestTo}>
                    {smtpTesting ? "Sending…" : "Send test email"}
                  </button>
                  {smtpTestMessage && <span className="chip">{smtpTestMessage}</span>}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
