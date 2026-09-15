"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "../_components/ConfirmDialog";
import { useCurrentUser } from "../_lib/CurrentUserProvider";
import type { Role } from "@/auth/roles";

interface UserRow {
  id: number;
  username: string;
  role: Role;
  created_at: string;
  last_login_at: string | null;
}

const ROLE_LABEL: Record<Role, string> = {
  viewer: "Viewer",
  operator: "Operator",
  engineer: "Engineer",
};

export default function UsersPage() {
  const { username: myUsername } = useCurrentUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("viewer");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  function fetchUsers() {
    fetch("/api/users", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => setUsers(body.users ?? []))
      .catch(() => {});
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleCreate() {
    if (!newUsername || !newPassword) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFormError(body.error ?? "Failed to create user");
        return;
      }
      setUsers((prev) => [...prev, body.user]);
      setNewUsername("");
      setNewPassword("");
      setNewRole("viewer");
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(user: UserRow) {
    try {
      await fetch(`/api/users?id=${user.id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } finally {
      setConfirmDelete(null);
    }
  }

  function openReset(user: UserRow) {
    setResetTarget(user);
    setResetPassword("");
    setResetError(null);
  }

  async function handleResetPassword() {
    if (!resetTarget || !resetPassword) return;
    setResetSubmitting(true);
    setResetError(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: resetTarget.id, password: resetPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        setResetError(body.error ?? "Failed to reset password");
        return;
      }
      setResetTarget(null);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : String(err));
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <>
      <h1>Users &amp; roles</h1>
      <p className="lead">
        Viewer sees the Multiviewer, streams, statistics and logs. Operator adds push, record, channels, and publish
        keys &amp; links. Engineer adds output profiles, hosts &amp; apps, access settings, and this page. Each role
        includes everything below it. Want to change your own password instead of resetting someone else&apos;s? Use{" "}
        <a href="/account">My account</a>.
      </p>

      <div className="row" style={{ marginTop: 6, marginBottom: 10 }}>
        <span className="grow"></span>
        <button className="btn pri" onClick={() => setShowForm((v) => !v)}>
          New user
        </button>
      </div>

      <div className="table-wrap">
        <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Created</th>
            <th>Last login</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="mono">
                {u.username}
                {u.username === myUsername && <span className="chip" style={{ marginLeft: 8 }}>you</span>}
              </td>
              <td>{ROLE_LABEL[u.role]}</td>
              <td>{u.created_at}</td>
              <td>{u.last_login_at ?? "never"}</td>
              <td className="acts">
                <a className="btn sm" href={`/audit?q=${encodeURIComponent(u.username)}`}>
                  History
                </a>
                <button className="btn sm" onClick={() => openReset(u)}>
                  Reset password
                </button>
                <button
                  className="btn sm danger"
                  disabled={u.username === myUsername}
                  onClick={() => setConfirmDelete(u)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>

      {showForm && (
        <div className="pane" style={{ marginTop: 12 }}>
          <div className="grid3">
            <label className="field">
              Username
              <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="e.g. anna" />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="at least 8 characters"
              />
            </label>
            <label className="field">
              Role
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)}>
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                <option value="engineer">Engineer</option>
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <span className="grow"></span>
            {formError && <span className="chip warn">{formError}</span>}
            <button className="btn pri" onClick={handleCreate} disabled={submitting || !newUsername || !newPassword}>
              Create user
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete user?"
        message={`"${confirmDelete?.username}" will no longer be able to log in.`}
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      {resetTarget && (
        <div className="modal-backdrop" onClick={() => setResetTarget(null)}>
          <div className="pane modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Reset password for &quot;{resetTarget.username}&quot;</h3>
            <label className="field">
              New password
              <input
                type="password"
                autoFocus
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="at least 8 characters"
              />
            </label>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              {resetError && <span className="chip warn">{resetError}</span>}
              <button className="btn" onClick={() => setResetTarget(null)}>
                Cancel
              </button>
              <button
                className="btn pri"
                onClick={handleResetPassword}
                disabled={resetSubmitting || resetPassword.length < 8}
              >
                Reset password
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
