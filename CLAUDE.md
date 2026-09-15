# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A self-hosted operator console for [OvenMediaEngine](https://github.com/AirenSoft/OvenMediaEngine) (OME), which otherwise has no UI. The full plan — architecture decisions, host facts, and a live sprint-by-sprint roadmap with what's actually done — lives at `/root/.claude/plans/i-want-you-to-dreamy-cookie.md`; read that first for anything beyond a quick orientation, since it's kept up to date every sprint and this file is not.

- `oven-console-prd.md` — the product requirements document (scope, architecture, constraints; §12 tracks answers to open questions once verified against the real running instance).
- `ome-console-mockup.html` — the static, clickable HTML/CSS/JS UI reference. The real console's design system (colors, fonts, component classes) is copied from this file verbatim into `console/src/app/globals.css`.
- `ome/` — OvenMediaEngine's own config (`conf/Server.xml`, `conf/Logger.xml`, mounted read-only into the `ome` container) and its log output (`logs/`, bind-mounted).
- `console/` — the Next.js 16 app (App Router, TypeScript). See "Console app" below.
- `docker-compose.yml` / `.env` (`.env.example` for the template) — the whole stack: OME + the console, both behind the host's existing Nginx Proxy Manager.

## Commands

All from `console/`, run inside the same Node version the Dockerfile uses (currently `node:24-slim` — check `console/Dockerfile` if this drifts):
```
npm run build   # next build — also runs the TypeScript check
npm run lint    # eslint
npm run dev     # local dev server against the same .env (note: session cookies
                 # are Secure only when NODE_ENV=production, so plain http://localhost
                 # dev login still works)
```
Deploying the real stack (from the repo root, not `console/`):
```
docker compose up -d              # bring up both services
docker compose build console      # rebuild after a console code change
docker compose logs -f console    # or `ome`
```
There is no test suite yet. Every sprint so far has been verified by actually pushing a real test stream (`ffmpeg` → RTMP/SRT) and driving the console with a headless browser (Playwright) against the real deployed HTTPS domain — not just a build/type check. Keep doing that for anything touching live data (the poller, SSE, the OME client) rather than trusting a green build alone.

## Console app architecture

- **Server-side-only OME access.** All OME REST calls go through `console/src/ome-client/client.ts`, imported only from server code (route handlers, server actions, server components). `OME_ACCESS_TOKEN` is never `NEXT_PUBLIC_`-prefixed and never reaches the browser. Auth header format (confirmed against the real API, not assumed from docs): `Authorization: Basic base64(ACCESS_TOKEN)` — no username/colon prefix.
- **One background poller, not per-page polling.** `console/src/stats-poller/` hits OME every 3s and fans a snapshot out over SSE (`console/src/app/api/live/route.ts`) to a single shared React context (`console/src/app/(console)/_lib/LiveSnapshotProvider.tsx`) — every page reads from that one connection.
- **`globalThis`-pinned singletons, always.** Next.js bundles `instrumentation.ts` and each route handler as *separate module graphs* even in one running process — a plain module-level `let`/`const` singleton silently splits into disconnected copies with no error. Hit this for both the SQLite connection (`console/src/db/index.ts`) and the poller's in-memory state (`console/src/stats-poller/index.ts`); the fix both times was pinning the mutable state on `globalThis`. Any new shared server-side state needs the same treatment.
- **`ENV HOSTNAME=0.0.0.0`is required in the Dockerfile's runner stage.** Docker auto-sets `HOSTNAME` to the container ID, which Next's standalone `server.js` reads as its bind address — without the override the app silently listens on only one of its two Docker networks.
- **SSE through the reverse proxy needs `proxy_buffering off`** (and related directives) on the NPM proxy host's Advanced config — nginx buffers proxied responses by default, which breaks streaming even though the app serves it fine directly. See the plan file's NPM Proxy Hosts section for the exact directive set and a duplicate-directive gotcha to avoid.
- **Real multi-user RBAC (Sprint 8a).** A `users` table (bcrypt password hashes) backs Viewer/Operator/Engineer roles (PRD §10, additive — Engineer implies Operator implies Viewer). A hand-rolled HMAC-signed session cookie (`console/src/auth/session.ts`, Web Crypto so it works unchanged in both the Node and Edge/proxy runtimes) bakes in `{userId, username, role}` at login time; `console/src/proxy.ts` (Next.js 16 renamed `middleware.ts`/`middleware()` to `proxy.ts`/`proxy()` — this is that convention, not a security workaround) verifies the cookie and checks a path/method → minimum-role rule table on every request, returning a JSON 403 for API routes or redirecting page routes. Role is deliberately not re-checked against the DB per-request (proxy.ts is Edge-runtime and can't use `better-sqlite3`) — a role change takes effect on that user's next login, a documented tradeoff. `console/src/auth/currentUser.ts` (Node-runtime only, via `next/headers`) reads the same cookie inside route handlers/server actions to get the real actor for `writeAudit` and for server components like the console layout. `CONSOLE_ADMIN_USER`/`CONSOLE_ADMIN_PASSWORD_HASH` now only seed the first `users` row (as Engineer) — real user management is the Users & roles page (`/users`, Engineer-only).
- **Console-owned state lives in SQLite** (`console/src/db/schema.ts`), bind-mounted at `console/data/console.sqlite` so it survives rebuilds. The schema is additive-only (`CREATE TABLE IF NOT EXISTS`, no destructive migrations) — don't add a table before the sprint that actually uses it (the `servers` table was the one exception: created empty in Sprint 2 for the multi-server registry, only given a real CRUD in Sprint 8b).
- **Multi-server registry is data-model-only, by design (Sprint 8b).** `console/src/db/servers.ts` + `/servers` (Engineer-only) let you register other OME instances (name/URL/token, AES-256-GCM-encrypted via `console/src/lib/crypto.ts` and `CONSOLE_ENCRYPTION_KEY`) and run a one-shot `getVersion()` reachability check — but the poller/reconciler/alert-evaluator and every OME-calling route still hardcode the single env-var-configured `getOmeClient()`. Don't wire a registered server into live operations without an explicit product decision to do so; PRD §5 and the roadmap's Tier-4 backlog both call operational multi-server switching out of scope indefinitely.
- **Backup**: `scripts/backup.sh` (run daily via a root cron entry — `crontab -l`) backs up `console.sqlite` (via `better-sqlite3`'s own `.backup()`, not a raw copy — the DB runs in WAL mode), `ome/conf/{Server,Logger}.xml`, `.env`, and `docker-compose.yml` into a `chmod 600` archive under `backups/` (gitignored). Recordings/VOD are deliberately excluded (large, separate filesystem) — see `BACKUP.md` for the full strategy and restore steps.
- **First-run setup wizard (`/setup`).** Gated by `console/src/lib/setupStatus.ts`'s `isSetupNeeded()` — a pure `process.env` read (`CONSOLE_SETUP_COMPLETE !== "true" && !CONSOLE_ADMIN_USER`) importable from both `proxy.ts` (Edge) and the wizard's own Node-runtime route, deliberately *not* an "is the `users` table empty" DB check (that would let the wizard lock itself out the instant step 1 creates the first account, before the rest of the steps run). `console/src/app/api/setup/route.ts` writes progressively to `.env` via `console/src/lib/envFile.ts` (a line-oriented read/replace/append that preserves every comment and unrelated var); `CONSOLE_SETUP_COMPLETE=true` is written last, on purpose. Like any other `.env` change, none of it takes effect in the *running* process until a real restart — the wizard's last step shows the exact `docker compose up -d` and a "Check" button (same copy-paste-then-live-check pattern as the SignedPolicy Rotate flow in `/access-settings`) rather than pretending to apply it live. `Server.xml`'s `<SignedPolicy>`/`<AdmissionWebhooks>` `<SecretKey>` are templated (`${env:...}`) the same way `<AccessToken>` and the vhost/app `<Name>` fields already were, so the wizard-generated secrets need no manual XML edit to take effect.

## Product architecture (from the PRD)

Still the source of truth for *why* the app is shaped this way — read `oven-console-prd.md` in full before designing a new feature. Key invariants that shape every write-path feature as they're built:

- **The console is a secondary source of state, not the primary one.** Server.xml-declared resources are read-only via the API (403 on writes) — the UI must show a "declared in Server.xml" badge, never a disabled control pretending it could work. API-created resources may not survive an OME restart, so the console holds "desired state" in SQLite and a reconciler re-applies it. The console must be the only writer to OME's API.
- **Every write that restarts an OME app must warn first**, naming the app and current live session count.
- **Push/record tasks bind to output stream names, not input streams**, and variant pickers are shared vocabulary across push, record, and multiplex UIs — build that vocabulary once, reuse it everywhere.
- **RTMP is single video + single audio track**, so per-language output needs one push task per language selecting `[video, audio_xx]` variants.
- See PRD §12 for open questions and their answers (several now confirmed against the real running instance — audio-track mapping is still open, pending a real multi-track test source).

## Working with the mockup

`ome-console-mockup.html`'s nav section IDs map directly to the console's real routes: `wall`→`/` (Multiviewer, the home screen), `addinput`→`/addinput`, `streams`, `push`, `rec`, `profiles`, `channels`, `access`, `config`, `stats`, `logs`. State-color convention, preserved in the real app's CSS: red/tally = publisher connected or recording, amber/warn = warning or queued, green/ok = pushing, idle = grey.
