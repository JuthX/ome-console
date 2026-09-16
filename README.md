![OME-Console](docs/banner.jpg)

# OME-Console

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

A self-hosted, open source operator console for [OvenMediaEngine](https://github.com/AirenSoft/OvenMediaEngine) (OME) — the streaming server OME itself ships with no UI for. OME-Console gives you a real web dashboard on top of it: live stream monitoring, push/record tasks, publish-key and viewer-link management, alerting, multi-user roles, and more.

> **Not affiliated with AirenSoft.** This is an independent, third-party project that talks to OME entirely through its public REST API. It isn't built, reviewed, or endorsed by the OvenMediaEngine team.

## Screenshots

| Sign in | Multiviewer |
| --- | --- |
| ![Login screen](docs/screenshots/login.png) | ![Multiviewer dashboard](docs/screenshots/multiviewer.png) |

| Publish keys & viewer links | Email (SMTP) settings |
| --- | --- |
| ![Publish keys and viewer links](docs/screenshots/access.png) | ![Email SMTP settings](docs/screenshots/smtp-settings.png) |

## What it does

- **Multiviewer** — every live input across the server, at a glance, with per-tile tracks/sessions/actions.
- **Streams, push & record** — pull/push RTMP/SRT/RTSP/WebRTC sources, push to RTMP/SRT/MPEG-TS destinations, schedule recordings, all with reusable presets.
- **Publish keys & viewer links** — gate who can publish (enforced live via an admission webhook) and issue expiring, signed playback links, without touching OME's config by hand.
- **Multi-user roles** — Viewer / Operator / Engineer, additive permissions, a real `users` table with bcrypt-hashed passwords.
- **Alerts** — a fixed rule catalog evaluated against the same live stats feed the UI uses, routed to email, with SMTP configurable right in the app (Engineer settings, on the Statistics & alerts page) — set it up during the initial wizard or any time after.
- **Audit log** — every console-initiated write, attributed to the user who made it.
- **Multi-server registry** — register other OME instances for a reachability check (operational multi-server switching is intentionally out of scope for now).

## Quick start

Requires Docker and Docker Compose. You'll also need a reverse proxy in front of both services for real TLS (any of Nginx Proxy Manager, Caddy, Traefik — this repo's `docker-compose.yml` assumes one exists but doesn't include one), and its container(s) need to share a Docker network with this stack:

```bash
docker network create proxy
```

(Skip this if a network literally named `proxy` already exists — `docker compose up -d` fails immediately with "network proxy declared as external, but could not be found" if it doesn't.)

```bash
git clone <this-repo-url>
cd ome-console
cp .env.example .env
docker compose up -d
```

Then visit `https://<your-console-domain>/setup` (or `http://localhost:3000/setup` for local testing) — a one-time wizard walks you through:

1. Creating your first (Engineer) account.
2. Connecting to this host's OvenMediaEngine instance — pick a host IP/domain, and either paste an access token or let the wizard generate one.
3. Naming your vhost/app (defaults match OME's own `default`/`app`).
4. Generating the session-signing and access-control secrets the console needs — strong, random, never hand-typed.
5. Optionally configuring SMTP for alert emails (skippable, can be set later).
6. Restarting the stack (`docker compose up -d` — the wizard shows you the exact command) so the new configuration takes effect, then confirming it's live.

After that, sign in at `/login` with the account you created.

**Already have real users?** Set `CONSOLE_ADMIN_USER`/`CONSOLE_ADMIN_PASSWORD_HASH` in `.env` instead — the wizard is skipped entirely and that becomes the first Engineer account.

## Architecture

- `ome/` — OvenMediaEngine's own config (`conf/Server.xml`, `conf/Logger.xml`), mounted read-only into the `ome` container.
- `console/` — the Next.js 16 app (App Router, TypeScript) that is this whole project's UI and API.
- `docker-compose.yml` / `.env` — the whole stack: OME + the console.

The two containers are named `ome` and `console` — generic names that could collide if another stack on the same host already uses them. Rename them in `docker-compose.yml`'s `container_name:` fields if that happens; `docker compose up -d` will otherwise fail with a clear "container name already in use" error, not something silent.

A few decisions worth knowing before you dig into the code:

- **The console is a secondary source of state, not the primary one.** Anything declared in `Server.xml` is read-only via OME's API — the console never pretends it can edit what it can't. Console-created resources (push/record tasks, publish keys, alert routes) live in the console's own SQLite database, and a reconciler re-applies them to OME after a restart, since OME itself doesn't persist API-created resources.
- **Server-side-only OME access.** Every OME REST call goes through one client module, imported only from server code — the API access token never reaches the browser.
- **One background poller, not per-page polling.** A single process hits OME's stats API every few seconds and fans a snapshot out over Server-Sent Events to every open tab.
- **Console-owned state lives in SQLite**, bind-mounted so it survives rebuilds. The schema is additive-only — nothing here does destructive migrations.

## License

[GNU AGPL v3.0](LICENSE) — the same license OvenMediaEngine itself uses. In short: you can self-host, modify, and redistribute this freely, but if you run a modified version as a network service, you must make your changes available to the people using it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local dev setup, the test suite (`npm test`, Vitest), and PR expectations. Found a security issue? See [SECURITY.md](SECURITY.md) instead of opening a public issue.
