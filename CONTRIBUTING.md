# Contributing

## Contributor License Agreement

By submitting a pull request or otherwise contributing code, documentation, or other content to this project, you agree to the following:

- You grant the maintainer (Thomas Tust) a perpetual, worldwide, non-exclusive, royalty-free, irrevocable license to use, reproduce, modify, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your contribution as part of ome-console, **under any license terms** — including terms different from the Elastic License 2.0 this project currently ships under. This is what lets the project relicense in the future (e.g. for a future release, a dual-licensing arrangement, or a commercial edition) without having to track down and re-clear every past contributor individually.
- You confirm that each contribution is your own original work, or that you otherwise have the right to submit it under these terms (for example, work done on behalf of an employer who has authorized you to contribute it).
- You keep your copyright — this isn't an assignment. You're licensing your contribution, not giving it away.

If you can't agree to this for a given contribution (e.g. your employer requires you to retain exclusive relicensing rights), please say so in the PR before it's reviewed, rather than after.

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
npm test        # vitest — unit tests for the pure/near-pure logic modules
npm run build   # next build — also runs the TypeScript check
```

The test suite covers pure logic (role hierarchy, SSRF allow/deny checks, UI formatters, login rate-limiting, the setup wizard's `.env` read/write helper) — it does not cover anything that talks to live data (the stats poller, SSE, the OME client, or any route that hits a real OvenMediaEngine instance). For that, every feature in this project has instead been verified by actually exercising it — pushing a real test stream, driving the UI with a headless browser — against a real deployed instance rather than trusting a green build alone. If you're touching anything in that category, please do the same before opening a PR: describe what you tested and how in the PR description.

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
