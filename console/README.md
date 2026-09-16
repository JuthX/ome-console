# OME-Console

The Next.js app that is OME-Console's whole UI and API — see the root [`README.md`](../README.md) for what this project is and how to run it.

## Local development

```bash
npm install
npm run dev
```

Needs a running OME instance and a `.env` to point at it. Most variables come straight from `../.env.example` (`OME_ACCESS_TOKEN`, `CONSOLE_ADMIN_USER`, `CONSOLE_ADMIN_PASSWORD_HASH`, `CONSOLE_SESSION_SECRET`, etc.) — copy it to `console/.env` (or export the same vars another way) and fill it in. Two vars are the exception: in the real Docker deployment `OME_API_BASE_URL` and `DATABASE_PATH` are hardcoded in `docker-compose.yml`'s `console.environment` block (`http://ome:8081` and `/app/data/console.sqlite`) rather than read from `.env`, since they're only meaningful inside the Docker network — running outside Docker via `npm run dev`, set them yourself, e.g. `OME_API_BASE_URL=http://localhost:8081` and `DATABASE_PATH=./data/console.sqlite`. There's no mock backend. Session cookies are only marked `Secure` when `NODE_ENV=production`, so logging in over plain `http://localhost:3000` in dev works fine.

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
