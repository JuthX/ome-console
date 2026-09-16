# OME-Console

The Next.js app that is OME-Console's whole UI and API — see the root [`README.md`](../README.md) for what this project is and how to run it.

## Local development

```bash
npm install
npm run dev
```

Needs the same environment variables the real deployment uses (`OME_API_BASE_URL`, `OME_ACCESS_TOKEN`, `DATABASE_PATH`, `CONSOLE_ADMIN_USER`, `CONSOLE_ADMIN_PASSWORD_HASH`, `CONSOLE_SESSION_SECRET` — see `../.env.example`) pointed at a real running OME instance; there's no mock backend. Session cookies are only marked `Secure` when `NODE_ENV=production`, so logging in over plain `http://localhost:3000` in dev works fine.

## Deploying

This app is never deployed standalone — it's one service in the root `docker-compose.yml`, built from `Dockerfile` and run behind your own reverse proxy. From the repo root:

```bash
docker compose build console
docker compose up -d console
```

## Checks

```bash
npm run lint    # eslint
npm test        # vitest
npm run build   # also runs the TypeScript check
```
