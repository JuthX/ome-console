"use client";

import { useState } from "react";
import { useCurrentUser } from "../_lib/CurrentUserProvider";

export default function AccountPage() {
  const { username, role } = useCurrentUser();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to change password");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>My account</h1>
      <p className="lead">
        Signed in as <span className="mono">{username}</span> ({role}).
      </p>

      <div className="pane" style={{ maxWidth: 420 }}>
        <h2 style={{ marginTop: 0 }}>Change password</h2>
        <label className="field">
          Current password
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label className="field" style={{ marginTop: 10 }}>
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="at least 8 characters"
          />
        </label>
        <label className="field" style={{ marginTop: 10 }}>
          Confirm new password
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </label>
        <div className="row" style={{ marginTop: 14 }}>
          <span className="grow"></span>
          {error && <span className="chip warn">{error}</span>}
          {success && <span className="chip">Password changed.</span>}
          <button
            className="btn pri"
            onClick={handleSubmit}
            disabled={submitting || !currentPassword || newPassword.length < 8 || !confirmPassword}
          >
            Change password
          </button>
        </div>
      </div>
    </>
  );
}
