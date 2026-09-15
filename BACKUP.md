# Backup strategy

## What's backed up, and why

`scripts/backup.sh` produces one `backups/console-backup-<timestamp>.tar.gz` per run, containing:

- **`console.sqlite`** — the console's own state (users, audit log, keys, viewer links, desired push/record tasks, alert routes, server registry). Taken via `better-sqlite3`'s own `.backup()` method inside the running `console` container, not a raw file copy — the DB runs in WAL mode, so a plain `cp` while the app is live can capture an inconsistent snapshot.
- **`Server.xml` / `Logger.xml`** — OME's own config. Without this, a fresh OME container comes up with none of this deployment's providers/publishers/vhost config.
- **`.env`** — every secret this deployment depends on (OME access token, session secret, SignedPolicy/AdmissionWebhooks secrets, SMTP credentials, the server-registry encryption key). The archive is `chmod 600`'d because of this.
- **`docker-compose.yml`** — so the whole deployment is reproducible from the archive alone, not just its data.

Retention: the last 14 archives are kept; older ones are pruned automatically on each run.

## What's deliberately NOT backed up here

- **`$RECORDINGS_DIR` and `$VOD_DIR`** (see `.env`) — recordings/VOD media is typically large and high-churn; keeping it off the routine config backup keeps that backup fast and small. Back these up separately, on whatever cadence matches how much re-recording a loss would cost you:
  ```
  rsync -av --delete "$RECORDINGS_DIR"/ /path/to/your/backup/target/recordings/
  rsync -av --delete "$VOD_DIR"/ /path/to/your/backup/target/vod/
  ```
- **The optional Let's Encrypt cert files** (see `docker-compose.yml`'s commented-out TLS bind mounts, if you've set them up) — owned and renewed by whatever ACME client manages them (certbot, your reverse proxy, etc.), not this project. Back these up (if at all) as part of that tool's own backup strategy, not this one.

## Running it

```
./scripts/backup.sh
```

Run from the repo root (or anywhere — the script `cd`s to its own repo root first). Requires the `console` container to be running (it shells out to `docker exec`/`docker cp`) and `python3` on the host (used only to run `PRAGMA integrity_check` against the freshly backed-up DB before archiving — the run fails loudly if the backup is somehow corrupt rather than silently shipping a bad archive).

A daily cron entry runs this automatically (see `crontab -l` on this host).

## Restoring

1. `docker compose down`
2. Extract the archive: `tar xzf backups/console-backup-<timestamp>.tar.gz -C /tmp/restore`
3. Copy files back into place:
   ```
   cp /tmp/restore/<timestamp>/console.sqlite console/data/console.sqlite
   cp /tmp/restore/<timestamp>/Server.xml ome/conf/Server.xml
   cp /tmp/restore/<timestamp>/Logger.xml ome/conf/Logger.xml
   cp /tmp/restore/<timestamp>/.env .env
   cp /tmp/restore/<timestamp>/docker-compose.yml docker-compose.yml
   ```
4. `docker compose up -d`
5. If recordings/VOD were also backed up separately, `rsync` them back into `$RECORDINGS_DIR`/`$VOD_DIR` before step 4 (OME reads them at startup for scheduled/multiplex channels).

**Verified for real (2026-09-15):** the steps above had only ever been documented, never actually performed — the backup half was tested, restore wasn't. Ran a genuine restore drill: extracted a real cron-produced archive into an isolated, throwaway Compose stack (separate container names, no published ports, no changes to the live `ome`/`console` containers or their real data) and confirmed end-to-end — OME booted cleanly from the restored `Server.xml`/`Logger.xml` (including loading the real TLS cert), the console read the restored `console.sqlite` correctly (`PRAGMA integrity_check` ok, real user/audit rows intact), and the console successfully reached OME's API using the restored access token. The live deployment was never touched; the throwaway stack was torn down afterward.
