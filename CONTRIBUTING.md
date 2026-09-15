# Contributing

## Local development

The console is the only app here with a real dev workflow — OvenMediaEngine itself is an upstream binary image, not something you build from source in this repo.

```bash
cd console
npm install
npm run dev     # local dev server against the same .env as the deployed stack
```

Session cookies are only marked `Secure` when `NODE_ENV=production`, so plain `http://localhost:3000` works fine for local development.

Before opening a PR, from `console/`:

```bash
npm run lint    # eslint
npm run build   # next build — also runs the TypeScript check
```

There's no automated test suite yet. Every feature in this project has been verified by actually exercising it — pushing a real test stream, driving the UI with a headless browser — against a real deployed instance rather than trusting a green build alone. If you're touching anything that talks to live data (the stats poller, SSE, the OME client), please do the same before opening a PR: describe what you tested and how in the PR description.

## Code conventions

- No test-scaffolding cruft: don't add abstractions, config flags, or error handling for scenarios that can't happen here. Trust internal invariants; validate at real boundaries (user input, the OME API response).
- Comments explain *why*, not *what* — a hidden constraint, a workaround for a specific OME quirk, a non-obvious invariant. If the code is already clear from good naming, skip the comment.
- `globalThis`-pinned singletons for any shared server-side state (an in-memory cache, a background job) — Next.js bundles route handlers and `instrumentation.ts` as separate module graphs even within one running process, so a plain module-level `let`/`const` silently splits into disconnected copies. See `console/src/db/index.ts` or `console/src/stats-poller/index.ts` for the pattern.
- Server-side-only OME access — every OME REST call goes through `console/src/ome-client/client.ts`, imported only from server code. Never let `OME_ACCESS_TOKEN` reach the browser.
- The console is a secondary source of state, never the primary one. Anything declared in `Server.xml` is read-only via the API; the UI must say so rather than offer a control that silently fails.

## Pull requests

- Keep PRs scoped to one change — easier to review, easier to verify.
- Describe what you tested and how (see "Local development" above).
- If your change touches `ome/conf/Server.xml` or `docker-compose.yml`, call out anything a self-hoster would need to know (new env var, a required restart, a breaking default change).

## Security issues

Please don't open a public issue for a security vulnerability — see [SECURITY.md](SECURITY.md) instead.
