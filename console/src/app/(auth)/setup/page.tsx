"use client";

import { useState } from "react";

type Step = "account" | "ome" | "secrets" | "smtp" | "finish";

const STEP_ORDER: Step[] = ["account", "ome", "secrets", "smtp", "finish"];
const STEP_LABEL: Record<Step, string> = {
  account: "Account",
  ome: "OvenMediaEngine",
  secrets: "Secrets",
  smtp: "Email (optional)",
  finish: "Finish",
};

function randomToken(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function postStep(step: Step, body: Record<string, unknown>) {
  const res = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ step, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `setup step "${step}" failed`);
  return json;
}

export default function SetupPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEP_ORDER[stepIndex];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step: account
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Step: OME
  const [hostIp, setHostIp] = useState("");
  const [accessToken, setAccessToken] = useState(randomToken(32));
  const [vhost, setVhost] = useState("default");
  const [app, setApp] = useState("app");

  // Step: SMTP
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");

  // Step: finish
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const [ready, setReady] = useState(false);

  function next() {
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  }

  async function handleAccount() {
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await postStep("account", { username, password });
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOme() {
    if (!hostIp) return setError("The host's public IP or domain is required.");
    setBusy(true);
    setError(null);
    try {
      const result = await postStep("ome", { hostIp, accessToken, vhost, app });
      setAccessToken(result.accessToken);
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSecrets() {
    setBusy(true);
    setError(null);
    try {
      await postStep("secrets", {});
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSmtp(skip: boolean) {
    setBusy(true);
    setError(null);
    try {
      await postStep("smtp", skip ? {} : { host: smtpHost, port: smtpPort, user: smtpUser, password: smtpPassword, from: smtpFrom });
      next();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    setBusy(true);
    setError(null);
    try {
      await postStep("finish", {});
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function checkReady() {
    setChecking(true);
    try {
      const res = await fetch("/api/setup", { cache: "no-store" });
      const body = await res.json();
      setReady(res.ok && body.needed === false);
    } catch {
      setReady(false);
    } finally {
      setChecking(false);
      setCheckedOnce(true);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 480 }}>
        <h1>OME-Console setup</h1>
        <p className="lead">
          One-time setup — {STEP_LABEL[step]} ({stepIndex + 1}/{STEP_ORDER.length})
        </p>

        {error && <p className="login-error">{error}</p>}

        {step === "account" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAccount();
            }}
          >
            <p className="lead" style={{ fontSize: 13 }}>
              Create your first account — this will be an Engineer (full access).
            </p>
            <label className="field">
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
            </label>
            <label className="field">
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <label className="field">
              Confirm password
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </label>
            <button className="btn pri" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Continue"}
            </button>
          </form>
        )}

        {step === "ome" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleOme();
            }}
          >
            <p className="lead" style={{ fontSize: 13 }}>
              Connect to this host&apos;s OvenMediaEngine instance.
            </p>
            <label className="field">
              Host public IP or domain
              <input
                value={hostIp}
                onChange={(e) => setHostIp(e.target.value)}
                placeholder="203.0.113.10"
                required
              />
            </label>
            <label className="field">
              API access token
              <input className="mono" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
            </label>
            <p className="note" style={{ fontSize: 12 }}>
              A strong token has been generated for you above — used to authenticate both OME&apos;s own API and this
              console against it. Change it only if you need a specific value.
            </p>
            <label className="field">
              VirtualHost name
              <input value={vhost} onChange={(e) => setVhost(e.target.value)} />
            </label>
            <label className="field">
              Application name
              <input value={app} onChange={(e) => setApp(e.target.value)} />
            </label>
            <button className="btn pri" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Continue"}
            </button>
          </form>
        )}

        {step === "secrets" && (
          <div>
            <p className="lead" style={{ fontSize: 13 }}>
              Generate the session-signing and access-control secrets this console needs — strong, random values,
              never hand-typed. They&apos;re written straight to <span className="mono">.env</span> and automatically
              picked up by <span className="mono">Server.xml</span>&apos;s existing templating.
            </p>
            <button className="btn pri" onClick={handleSecrets} disabled={busy}>
              {busy ? "Generating…" : "Generate secrets"}
            </button>
          </div>
        )}

        {step === "smtp" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSmtp(false);
            }}
          >
            <p className="lead" style={{ fontSize: 13 }}>
              Optional — lets the console email alert notifications. Skip this and set it later if you don&apos;t
              have an SMTP account handy.
            </p>
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
              <input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} />
            </label>
            <label className="field">
              From address
              <input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="alerts@example.com" />
            </label>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" type="button" onClick={() => handleSmtp(true)} disabled={busy}>
                Skip
              </button>
              <button className="btn pri" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Continue"}
              </button>
            </div>
          </form>
        )}

        {step === "finish" && (
          <div>
            {!ready ? (
              <>
                <p className="lead" style={{ fontSize: 13 }}>
                  1. Write the final setting and restart both containers so everything above takes effect:
                </p>
                <button className="btn" onClick={handleFinish} disabled={busy || saved}>
                  {saved ? "Saved" : busy ? "Writing…" : "1. Save configuration"}
                </button>
                <p className="mono" style={{ fontSize: 12, margin: "14px 0" }}>
                  docker compose up -d
                </p>
                <p className="lead" style={{ fontSize: 13 }}>
                  2. Run that command on the host, then confirm the new configuration is live:
                </p>
                <button className="btn pri" onClick={checkReady} disabled={!saved || checking}>
                  {checking ? "Checking…" : "2. Check"}
                </button>
                {checkedOnce && !ready && !checking && (
                  <p className="note" style={{ fontSize: 12, marginTop: 10 }}>
                    Not live yet — run the command above on the host, then click Check again.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="lead" style={{ fontSize: 13 }}>
                  Setup complete. Sign in with the account you created.
                </p>
                <a className="btn pri" href="/login">
                  Go to login
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
