# Oven Console — Product Requirements

Self-hosted operator console for OvenMediaEngine (OME). Reference mockup: `ome-console-mockup.html` (clickable; section names below match its sidebar).

Version 0.1 · September 2026

---

## 1. Problem

OME is the only free, self-hosted engine that covers ingest, transcoding, push publishing, recording and access control in one binary, but it ships with no UI. Everything is XML plus a REST API. On a show day that means an engineer with curl, not an operator with a screen. Nimble Streamer's free tier is gone and WMSPanel is a paid SaaS, so there is no off-the-shelf panel to adopt.

## 2. Goal

A single web console that exposes nearly the whole OME feature set, optimised for the moment a live event is running: is every input up, where is it going, and can I change that without breaking anything.

Success looks like: a producer who has never seen Server.xml can run a multi-phone SRT contribution setup into vMix, split a programme feed into per-language RTMP outputs, record ISOs, and hand out publish keys — from the console alone.

## 3. Non-goals

- Multi-tenant SaaS, billing, per-customer data slices (WMSPanel territory).
- Replacing Server.xml as the source of truth for the engine. The console reads it and edits API-created resources; static declarations stay on disk.
- Media processing in the console. Every media operation is OME's; the console never touches packets.
- Viewer analytics beyond what OME's statistics endpoints give (no geo, no CDN logs).
- DRM key management, origin-map (Redis) editing, P2P delivery. Real API surface, not show-day work; parked for an "Advanced" page.

## 4. Users

| User | Needs |
|---|---|
| Producer / TD (primary) | Multiviewer, tally, push and record buttons, keys for crew phones, no surprises |
| Streaming engineer | Profiles, app/host config, alerts, logs, API drift visibility |
| Crew member with a phone | A link or QR that just works in Larix/OBS; nothing else |

## 5. Deployment context

- OME 0.21.x in Docker on a VPS; API on `<Bind><Managers><API>` bound to localhost or a private network only. The console's backend is the only API client.
- Console = small web app (SvelteKit or Next.js) + backend proxy + SQLite. Runs as a sibling container on the same host or on a management box with VPN access to the API.
- Reverse proxy (Caddy/Traefik) in front with TLS and login. The OME AccessToken never reaches a browser.
- Multi-server from day one in the data model (server registry), single-server in the UI for v1.

## 6. Engine constraints the product must respect

These are facts from the OME REST API docs and drive UI behaviour:

1. **Anything declared in Server.xml is read-only via API** (403 on POST/PUT/PATCH/DELETE). UI shows a "declared in Server.xml" badge instead of disabled controls, with a "how to change on disk" hint.
2. **Changing an application or an output profile restarts the app** and disconnects every publisher and viewer on it. Every such write carries a blocking confirmation naming the app and the live session count.
3. **`PATCH /apps/{app}` cannot change `name` or `outputProfiles`.** Profiles are managed via their own endpoints.
4. **Push and record tasks bind to *output* stream names**, not input streams. Variant pickers filter by the selected output stream.
5. **Push/record tasks can be reserved** before the stream exists and start automatically. The console uses this for "on connect" behaviour.
6. **RTMP carries one video and one audio track.** Per-language outputs = one push task per language with `variantNames` selecting `[video, audio_xx]`.
7. **API-created resources are not guaranteed to survive an engine restart.** The console holds desired state and re-applies on reconnect.
8. **Rotating the SignedPolicy secret invalidates every issued link.** Treated as a destructive action with a re-issue step.

## 7. Scope by feature

Tiers double as milestones. Each tier is shippable.

### Tier 1 — Monitor (show-day visibility)

| Feature | Detail | OME API |
|---|---|---|
| Multiviewer | Tile per input across all apps; tally edge when a publisher is connected; REC / PUSH / protocol badges; bitrate meter with amber near declared cap; viewer count; uptime; thumbnail refresh | streams list, stream info, statistics, thumbnail publisher |
| Stream drawer | Tracks (codec, resolution, fps, bitrate, language), input peer and SRT stats, sessions by publisher type (SRT callers named, e.g. vMix), outputs derived from this stream, 10-min health sparkline | stream info, statistics |
| Streams table | Inputs and output streams (after profiles) with playback links | streams, output profiles |
| Statistics | Server / vhost / app / stream throughput, sessions by protocol, max sessions | `/v1/stats/current/...` |
| Logs | Tail of engine log with fold/filter by stream | not in API; tail file or Docker logs |
| Server | Version, API reachability, CPU/GPU load | `/v1/version`, host metrics |

### Tier 2 — Operate

| Feature | Detail | OME API |
|---|---|---|
| Push targets | List active/queued tasks with state and sent bytes; create with stream, video variant, audio variant, protocol (RTMP / SRT caller / MPEG-TS), URL, key; stop; presets; "start when stream appears" | `startPush`, `stopPush`, `pushes` |
| Recording | Start/stop with track selection, segment interval or schedule, file path template; queued state; list written segments | `startRecord`, `stopRecord`, `records` |
| LLHLS tools | HLS dump start/stop, conclude live — per stream, with stream picker | `:startHlsDump`, `:stopHlsDump`, `:concludeHlsLive` |
| Stream actions | Send ID3 event, send subtitles, disconnect publisher (delete stream), create RTSP pull source | `:sendEvent`, `:sendSubtitles`, `DELETE stream`, `POST streams` |
| Add-input wizard | One flow: name stream → issue key/link → queue record/push/alert on connect. Produces a "reserved" tile on the multiviewer (console-owned state) | reserved push/record tasks + console DB |
| Scheduled channels | Playlist items (files, live streams), fallback, skip | ScheduledChannel API |
| Multiplex channels | Pick video track from one input, audio tracks from others, name the output | MultiplexChannel API |

### Tier 3 — Manage

| Feature | Detail | OME API |
|---|---|---|
| Output profiles | View, create, duplicate, edit encodes (video/audio: codec, size, fps, bitrate, bypass, bypassIfMatch, hardware encoder), playlists/ABR; restart warning | output profile endpoints |
| Hosts & apps | vHost list with names, TLS expiry, reload certificate; app providers (SRT, RTMP, WebRTC/WHIP, RTSP pull, MPEG-TS, OVT) and publishers (WebRTC, LLHLS, HLS, SRT, thumbnails, OVT) with their key settings; cross-domains; origin settings | vhost/app endpoints, `:reloadCertificate` |
| Access | SignedPolicy on/off, scopes, query key names, secret rotation with re-issue; AdmissionWebhooks URL/timeout with recent allow/deny counts | vhost object |
| Publish keys & device links | Console-owned: key per device/person, bound to stream name and protocol, expiry, last used, revoke, copy link, QR. Enforced through the admission webhook the console itself serves and/or signed-policy URLs it generates | admission webhook (console endpoint), signed policy |
| Viewer links | Signed WebRTC/LLHLS/SRT links with expiry | signed policy |
| Alerts | Engine alert rules (bitrate high/low, fps drop, push down, load) with routing to Slack/SMS/email | alert config + console notifier |

### Tier 4 — Later / Advanced

Origin-edge cluster view, DRM config, P2P, multi-server dashboard, historical stats retention beyond OME's live counters.

## 8. Console-owned state (SQLite)

| Table | Why it exists |
|---|---|
| `servers` | API base URL, token (encrypted), version, last seen |
| `desired_push_tasks`, `desired_record_tasks` | Re-applied after engine restart; source of "queued" state |
| `push_presets` | Destination templates with keys |
| `keys` | Publish keys: stream, protocol, holder, expiry, revoked, last used |
| `viewer_links` | Issued signed links and expiry |
| `alert_routes` | Where each rule notifies |
| `layouts` | Multiviewer layout and labels per user |
| `audit` | Every write with who/when/what, plus admission allow/deny log |

Everything else is read live from OME on every view; the console caches nothing it can re-query.

## 9. Architecture

```
Browser ──HTTPS──> Console web (SvelteKit)
                       │  session auth (users, roles: operator / engineer / viewer)
                       ▼
                 Console backend (Node/TS)
                   ├─ OME client (typed, per-version adapters)
                   ├─ Desired-state reconciler (on boot, on OME reconnect, every 30 s)
                   ├─ Stats poller (2–5 s) → SSE/WebSocket fan-out to browsers
                   ├─ Admission webhook endpoint (called by OME)
                   ├─ Notifier (Slack, SMS, email)
                   └─ SQLite
                       │  HTTP Basic (AccessToken), private network only
                       ▼
                 OvenMediaEngine REST API (8081/8082) + log tail
```

- One poller talks to OME; browsers never poll OME directly.
- OvenPlayer embedded for previews using console-signed WebRTC links.
- Version adapters: pin the OME version in Docker; the client has a small compatibility layer per minor release so API drift is a contained change.

## 10. Roles

| Role | Can |
|---|---|
| Viewer | Multiviewer, streams, stats, logs |
| Operator | + push, record, LLHLS tools, keys, channels, stream actions |
| Engineer | + profiles, hosts & apps, access settings, alert rules, server registry |

## 11. UX principles (from the mockup)

- The multiviewer is the home screen; colour encodes state only (red = publisher connected / recording, amber = warning or queued, green = pushing).
- Every write that restarts an app says so, names the app, and shows the live session count before the confirm button.
- Variants are the shared vocabulary across push, record and multiplex. Users pick from the same named encodes everywhere.
- Server.xml items are explained, not hidden.
- Copy in the interface uses operator language ("Start recording", "Disconnect publisher"), not engine language ("POST :startRecord").

## 12. Open questions — verify on a real 0.21 instance before build

Answered against a real `airensoft/ovenmediaengine:v0.21.0` instance in Sprint 1 (2026-09-12), except where noted still open:

1. **Multiple input audio tracks vs output profiles.** *Partially answered.* With a single-audio-track RTMP/SRT test source, one `<Audio>` Encode block produces one output variant per block (we defined `aac_audio` bypass + `opus_audio` transcode, and got both as separate renditions in the master playlist — confirming an Encode block is "apply this codec to a track", not "one encode = one output stream"). The `RenditionTemplate`'s `AudioTemplate` filters (commented-out `VariantName`/`AudioIndexHint`/channel/samplerate filters in the shipped config) are how a template targets a *specific* input track by index — this needs a follow-up test with a genuinely multi-audio-track source (e.g. SRT/MPEG-TS carrying 2+ audio tracks, or a real multi-language contribution feed) before the per-language push design (Sprint 4) is finalized. Still open: real multi-track behavior.
2. **Persistence of API-created vhosts/apps/profiles across restart** — not yet tested (no API-created resources exist yet; this is exercised properly in Sprint 4/5 when push/record tasks and the reconciler are built). Still open.
3. **Statistics granularity** — **Answered: per-session peer addresses ARE exposed**, not just counts. `GET /v1/vhosts/{vhost}/apps/{app}/streams/{stream}` returns `input.sourceUrl` with the actual peer address (observed `"sourceUrl":"TCP://203.0.113.10:50154/tcp"` for a live RTMP test push). This is enough to name a vMix SRT session by its source address in the multiviewer/stream drawer (Sprint 3).
4. **Thumbnail publisher** cost — **Answered (directionally).** Two concurrent full pipelines (RTMP + SRT, each: H.264 bypass + AAC bypass + Opus transcode + 1fps JPEG thumbnail encode) used ~38% CPU total on this host's 4c/8t Intel i7-6700 (~19%/stream). The thumbnail encode itself is a small fraction of that (most cost is the audio transcode); more importantly, the *console polling the thumbnail endpoint every 2s* costs nothing extra server-side beyond that, since OME serves the last-generated frame rather than re-encoding per HTTP request — the real cost driver is the number of concurrent full-transcode streams, not the console's poll interval. On a 2-vCPU box (half this host's threads), 8+ concurrent full-transcode-with-thumbnail streams would likely saturate it; bypass-only (no thumbnail/no audio transcode) streams would cost much less.
5. **ScheduledChannel live items** — not yet tested (Sprint 5 feature). Still open.
6. **Log access** — **Answered: both work.** OME writes structured logs to `/var/log/ovenmediaengine` inside the container (confirmed via the bind-mounted `ome/logs/ovenmediaengine.log` on the host, per `Logger.xml`'s `<Path>`) AND the same content is visible via `docker logs ome` (stdout/stderr capture is unaffected by the file sink, per `Logger.xml`'s own comment). The console's Sprint 3 logs feature can use either; file-tail is likely simpler since it doesn't require Docker socket access from the console container.

Also confirmed in Sprint 1, not originally listed as an open question but worth recording: the REST API's `AccessToken` auth is `Authorization: Basic base64(AccessToken)` — the raw token alone, base64-encoded, with **no username/colon prefix** (despite some third-party docs describing it as `user-id:password` format). SRT ingest's `streamid` must be `{host}/{app}/{stream}` (e.g. `default/app/mystream`) — the `srt://app/stream` form used in some older examples is rejected by 0.21. WebRTC playback (needed for the console's embedded OvenPlayer previews, §9) is a signalling URL of the form `wss://{domain}/{app}/{stream}` — end-to-end WebRTC (ICE + SRTP) through NPM's shared 3333 listener and this project's `<IceCandidates>` public-IP config was verified working from a real off-network device (phone on cellular data) via OvenMediaLabs' own public test tool at `https://demo.ovenplayer.com/demo.html`, which is a handy way to sanity-check any future WebRTC config change without building a test harness.

## 13. Milestones

| Milestone | Contents | Estimate (agent-assisted) |
|---|---|---|
| M0 Spike | Answer §12 on a test instance; typed OME client with fixtures | 2 days |
| M1 Monitor | Tier 1, single server, read-only, login | 3 days |
| M2 Operate | Tier 2 incl. add-input wizard, reconciler, presets | 5 days |
| M3 Manage | Tier 3 incl. keys, admission webhook, alerts routing | 5–7 days |
| M4 Polish | Roles, audit, multi-server registry, mobile layout for the multiviewer | 3 days |

## 14. Risks

- **API drift between OME minors** — mitigated by pinned version and adapter layer.
- **Reconciler fighting manual API use** — console must be the only writer, documented as such.
- **Audio track mapping unsupported** — fallback is FFmpeg sidecar triggered by the console (already validated pattern with MediaMTX).
- **AGPLv3 on OME** — the console is a separate program over HTTP and is not affected; OME itself must be distributed with source if modified.
