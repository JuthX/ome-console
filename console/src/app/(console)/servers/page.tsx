"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "../_components/ConfirmDialog";

const POLL_MS = 5000;

interface ServerRow {
  id: number;
  name: string;
  api_base_url: string;
  version: string | null;
  last_seen_at: string | null;
  created_at: string;
}

type TestResult = { ok: true; version: string } | { ok: false; error: string };

export default function ServersPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rowTest, setRowTest] = useState<Record<number, TestResult | "testing">>({});
  const [confirmDelete, setConfirmDelete] = useState<ServerRow | null>(null);

  function fetchServers() {
    fetch("/api/servers", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setServers(body.servers ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    fetchServers();
    const id = setInterval(fetchServers, POLL_MS);
    return () => clearInterval(id);
  }, []);

  async function handleTestForm() {
    if (!apiBaseUrl || !accessToken) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/servers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_base_url: apiBaseUrl, access_token: accessToken }),
      });
      setTestResult(await res.json());
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  async function handleTestRow(server: ServerRow) {
    setRowTest((prev) => ({ ...prev, [server.id]: "testing" }));
    try {
      const res = await fetch("/api/servers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: server.id }),
      });
      const result = await res.json();
      setRowTest((prev) => ({ ...prev, [server.id]: result }));
      fetchServers();
    } catch (err) {
      setRowTest((prev) => ({
        ...prev,
        [server.id]: { ok: false, error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  async function handleCreate() {
    if (!name || !apiBaseUrl || !accessToken) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, api_base_url: apiBaseUrl, access_token: accessToken }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Failed to add server");
        return;
      }
      setServers((prev) => [...prev, body.server]);
      setName("");
      setApiBaseUrl("");
      setAccessToken("");
      setTestResult(null);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(server: ServerRow) {
    try {
      await fetch(`/api/servers?id=${server.id}`, { method: "DELETE" });
      setServers((prev) => prev.filter((s) => s.id !== server.id));
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <h1>Other servers</h1>
      <p className="lead">
        Other OvenMediaEngine instances, tracked here for the future — this console still operates only against the
        one it&apos;s configured for. Adding a server does not connect the console to it; &quot;Test connection&quot;
        is a one-off reachability check, nothing more.
      </p>

      <div className="row" style={{ marginTop: 6, marginBottom: 10 }}>
        <span className="grow"></span>
        <button className="btn pri" onClick={() => setShowForm((v) => !v)}>
          Add server
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>API base URL</th>
            <th>Token</th>
            <th>Version</th>
            <th>Last tested</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => {
            const test = rowTest[s.id];
            return (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="mono">{s.api_base_url}</td>
                <td className="mono">••••••••</td>
                <td>{s.version ?? "—"}</td>
                <td>{s.last_seen_at ?? "never"}</td>
                <td className="acts">
                  <button className="btn sm" disabled={test === "testing"} onClick={() => handleTestRow(s)}>
                    {test === "testing" ? "Testing…" : "Test"}
                  </button>
                  {test && test !== "testing" && (
                    <span className={`chip${test.ok ? "" : " warn"}`} style={{ marginLeft: 6 }}>
                      {test.ok ? `ok · v${test.version}` : test.error}
                    </span>
                  )}
                  <button className="btn sm danger" onClick={() => setConfirmDelete(s)}>
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showForm && (
        <div className="pane" style={{ marginTop: 12 }}>
          <div className="grid3">
            <label className="field">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. backup-site" />
            </label>
            <label className="field">
              API base URL
              <input
                className="mono"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://ome2.example.com:8081"
              />
            </label>
            <label className="field">
              Access token
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="OME AccessToken"
              />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={testing || !apiBaseUrl || !accessToken} onClick={handleTestForm}>
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult && (
              <span className={`chip${testResult.ok ? "" : " warn"}`}>
                {testResult.ok ? `Reachable · v${testResult.version}` : testResult.error}
              </span>
            )}
            <span className="grow"></span>
            {formError && <span className="chip warn">{formError}</span>}
            <button className="btn pri" onClick={handleCreate} disabled={submitting || !name || !apiBaseUrl || !accessToken}>
              Add server
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove server?"
        message={`"${confirmDelete?.name}" will be removed from the registry.`}
        confirmLabel="Remove"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}
