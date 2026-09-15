"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Oven Console</h1>
        <p className="lead">Sign in to manage this OvenMediaEngine instance.</p>
        <form action={formAction}>
          <label className="field">
            Username
            <input name="username" autoComplete="username" required autoFocus />
          </label>
          <label className="field">
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {state.error && <p className="login-error">{state.error}</p>}
          <button className="btn pri" type="submit" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
