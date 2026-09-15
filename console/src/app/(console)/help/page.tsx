const SECTIONS: { id: string; label: string }[] = [
  { id: "wall", label: "Multiviewer & adding an input" },
  { id: "streams", label: "Streams" },
  { id: "push", label: "Push targets" },
  { id: "rec", label: "Recording" },
  { id: "profiles", label: "Output profiles" },
  { id: "channels", label: "Channels" },
  { id: "access", label: "Publish keys & links" },
  { id: "access-settings", label: "Access settings" },
  { id: "hosts", label: "Hosts & apps" },
  { id: "stats", label: "Statistics & alerts" },
  { id: "logs", label: "Logs" },
  { id: "admin", label: "Users, other servers & audit log" },
  { id: "account", label: "My account" },
  { id: "roles", label: "Roles" },
];

export default function HelpPage() {
  return (
    <>
      <h1>Help</h1>
      <p className="lead">
        A single console for the moment a live event is running: is every input up, where is it going, and can you
        change that without breaking anything. This page explains what each page and field is for — it doesn&apos;t
        change anything itself.
      </p>

      <div className="pane">
        <div className="grid2">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.label}
            </a>
          ))}
        </div>
      </div>

      <h2 id="wall">Multiviewer & adding an input</h2>
      <p className="lead">
        The home screen — a tile per input across every app, all fed by one live connection so the whole page updates
        without reloading.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>LIVE / REC tags</dt>
          <dd>LIVE shows whenever a publisher is connected. REC appears only while that stream is also recording to a file.</dd>
          <dt>Protocol tag</dt>
          <dd>How the input arrived — SRT, RTMP, WebRTC, and so on.</dd>
          <dt>Uptime</dt>
          <dd>Time since this publisher connected.</dd>
          <dt>Codec / resolution line</dt>
          <dd>e.g. &quot;h264 1080p30&quot;, plus how many audio tracks it carries, or &quot;no video&quot; for audio-only sources.</dd>
          <dt>Bitrate meter</dt>
          <dd>A bar showing how close the stream is to a reference ceiling.</dd>
          <dt>Reserved tiles</dt>
          <dd>
            A dimmer tile for a stream that has a push or record task queued but no publisher connected yet —
            &quot;waiting for publisher&quot;. It fills in automatically the moment the real source connects.
          </dd>
        </dl>
        <p className="note">
          The bitrate meter&apos;s ceiling is a rough placeholder, not each stream&apos;s real configured limit —
          treat the bar as a rough-eyeball indicator, not an exact measurement.
        </p>
      </div>

      <p className="lead" style={{ marginTop: 18 }}>
        Click <b>Add input</b> on the Multiviewer to name a stream and queue what should happen the moment it
        connects.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>Stream name</dt>
          <dd>The name the publisher will connect with — this is what appears everywhere else in the console.</dd>
          <dt>Source</dt>
          <dd>SRT (the encoder calls in to this server) or RTMP (same, but over RTMP) — determines which ingest URL you get.</dd>
          <dt>Assigned to</dt>
          <dd>A free-text label (e.g. &quot;Spare phone 2&quot;) shown next to this stream&apos;s tile while it&apos;s reserved.</dd>
          <dt>Record on connect</dt>
          <dd>Records every track to one continuous file the moment the source connects. On by default.</dd>
          <dt>Push on connect</dt>
          <dd>Immediately re-streams to a destination URL the moment the source connects — same fields as the Push targets page.</dd>
        </dl>
        <p className="note">
          This hands out a plain, shared ingest URL — there&apos;s no per-device key or expiry on this path. For a
          revocable, per-crew-member link instead, use <a href="#access">Publish keys &amp; links</a>.
        </p>
      </div>

      <h2 id="streams">Streams</h2>
      <p className="lead">Every live input in this app, with its tracks and who&apos;s watching.</p>
      <div className="pane">
        <dl className="kv">
          <dt>Video / Bitrate / Viewers</dt>
          <dd>Live codec, resolution and current bitrate for that input, and how many sessions are watching it.</dd>
          <dt>Add pull source</dt>
          <dd>Have this server pull an RTSP camera in as a stream, rather than waiting for it to push to you.</dd>
          <dt>RTSP URL</dt>
          <dd>The camera or source URL to pull from, e.g. rtsp://10.0.4.21/stream1.</dd>
          <dt>Keep pulling even with no viewers</dt>
          <dd>Off by default — the pull normally stops when nobody is watching. Turn this on to keep it running regardless.</dd>
        </dl>
        <p className="note">Adding a pull source needs Operator or above — Viewers see the stream list but not this form.</p>
      </div>

      <h2 id="push">Push targets</h2>
      <p className="lead">
        Re-stream any output to RTMP, SRT or MPEG-TS — picking exactly which video and audio tracks go to each
        target.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>Name</dt>
          <dd>A label for this target, e.g. &quot;YouTube · DE&quot; — becomes its task ID.</dd>
          <dt>Output stream</dt>
          <dd>Which stream (by name) to push from — can be typed before that stream is live.</dd>
          <dt>Variant picker</dt>
          <dd>Choose specific video/audio tracks to send, instead of everything — only populated once a matching stream is live.</dd>
          <dt>URL / Stream key</dt>
          <dd>The destination address, and its stream key if the platform needs one separately.</dd>
          <dt>Save as preset</dt>
          <dd>Store this URL/protocol/key combination to reuse on a future target (needs Name and URL).</dd>
        </dl>
        <p className="note">
          &quot;Start automatically when the stream appears&quot; describes what always happens, not an optional
          behavior — a target created before its stream exists just waits, then starts the instant it goes live, with
          or without that switch.
        </p>
      </div>

      <h2 id="rec">Recording</h2>
      <p className="lead">
        Records to the server&apos;s file root as .ts or .mp4, split at an interval or by schedule. Track selection
        matches Push targets.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>Segments</dt>
          <dd>Single file, split every N minutes, or split on a cron schedule.</dd>
          <dt>File path template</dt>
          <dd>
            Where the file is written. Supports <span className="mono">${"{VirtualHost}"}</span>,{" "}
            <span className="mono">${"{Application}"}</span>, <span className="mono">${"{Stream}"}</span>, and{" "}
            <span className="mono">${"{StartTime:...}"}</span>/<span className="mono">${"{EndTime:...}"}</span> with a
            date-format token, e.g. YYYYMMDDhhmmss.
          </dd>
        </dl>
        <p className="note">
          A matching .xml info file is written alongside every segment automatically — same name, .xml instead of
          .ts/.mp4.
        </p>
      </div>
      <div className="pane" style={{ marginTop: 12 }}>
        <dl className="kv">
          <dt>HLS dump</dt>
          <dd>Writes the live LLHLS playlist and segments to disk while the stream runs — instant VOD, no re-encode.</dd>
          <dt>Conclude live</dt>
          <dd>Marks the LLHLS playlist as ended, so players stop waiting for new segments once the show is over.</dd>
        </dl>
        <p className="note">
          Whether a dump is running is only tracked in your browser, not on the server — reloading this page shows
          &quot;Start dump&quot; again even if one is still writing.
        </p>
      </div>

      <h2 id="profiles">Output profiles</h2>
      <p className="lead">How each input is turned into outputs — passthrough, or a transcoded rendition.</p>
      <div className="pane">
        <dl className="kv">
          <dt>Output stream name</dt>
          <dd>
            Template for the resulting output stream&apos;s name, e.g. <span className="mono">${"{OriginStreamName}"}_profile</span>.
          </dd>
          <dt>Video / Audio</dt>
          <dd>Bypass (no re-encode) or Encode — choosing Encode reveals codec, size/bitrate/fps or samplerate/channels fields.</dd>
        </dl>
        <p className="note">
          This form creates one video rendition plus one audio rendition — not a multi-bitrate ABR ladder. For an app
          declared in Server.xml, creating or deleting a profile restarts that app and disconnects everyone on it;
          the confirm dialog shows exactly how many live sessions that is before you commit.
        </p>
      </div>

      <h2 id="channels">Channels</h2>
      <p className="lead">
        Server-side sources that aren&apos;t a single publisher: playlists that hold a slot until a live feed
        arrives, and multiplexers that combine tracks from several inputs into one output.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>Scheduled — Loop a file</dt>
          <dd>Repeats one file from the host&apos;s vod/ directory indefinitely.</dd>
          <dt>Scheduled — Show a live stream</dt>
          <dd>
            Plays a chosen stream, falling back to a file when it isn&apos;t live — type a name that isn&apos;t live
            yet to reserve the channel ahead of time, same as Push/Recording.
          </dd>
          <dt>Multiplex — Video / Audio pickers</dt>
          <dd>Pick a track from one input for video and a track from another (or the same) input for audio, combined into one new output.</dd>
        </dl>
        <p className="note">
          Both channel types always produce exactly one output rendition. No files to loop? Copy a video into the
          host&apos;s vod/ directory first — that&apos;s what the file picker lists.
        </p>
      </div>

      <h2 id="access">Publish keys & links</h2>
      <p className="lead">
        Who may publish and who may watch, managed by this console and enforced live through the admission webhook.
        Engine-level access settings (Signed policy, Admission webhooks) are a separate, Engineer-only page — see{" "}
        <a href="#access-settings">Access settings</a>.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>Publish key</dt>
          <dd>
            One per device or crew member, bound to a stream name and protocol. Revoking one takes effect
            immediately — the admission webhook checks it on every connection attempt, not just once. Delete removes
            the row entirely (works on active or already-revoked keys) once you don&apos;t need its history anymore.
          </dd>
          <dt>Load / Save preset</dt>
          <dd>
            Reuse a protocol + default expiry duration across events — holder and stream name are always typed fresh
            per key. The × on a saved preset&apos;s chip removes it.
          </dd>
          <dt>Viewer link</dt>
          <dd>
            A signed WebRTC/LLHLS URL with an expiry, verified by the engine itself rather than the console — Delete
            stops tracking it here, but since OME (not the console) verifies the signature, an already-issued link
            may still work until it naturally expires.
          </dd>
        </dl>
        <p className="note">
          An SRT-protocol key isn&apos;t only for publishing in — a caller (vMix, ffplay, etc.) can also pull that
          same stream straight from the server, on a separate SRT port from the one used for ingest, using the same
          <span className="mono"> streamid=vhost/app/stream</span> format. Ask an Engineer for this
          deployment&apos;s pull port if you need it.
        </p>
      </div>

      <h2 id="access-settings">Access settings</h2>
      <p className="lead">
        Engine-level access control, declared in Server.xml — inspect here, change on disk. Engineer-only.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>Signed policy / Admission webhook switches</dt>
          <dd>Read-only status, not toggleable here — on/off is set in Server.xml.</dd>
          <dt>Rotate (SignedPolicy secret)</dt>
          <dd>
            Generates a new secret, but doesn&apos;t apply it by itself — you still update <span className="mono">.env</span> and{" "}
            <span className="mono">Server.xml</span>, restart both containers, confirm the engine is back up, then
            re-issue every stored viewer link with the new secret.
          </dd>
        </dl>
        <p className="note">
          Rotating invalidates every previously issued viewer link until you re-issue them. &quot;Check engine&quot;
          before re-issuing only confirms the engine is reachable again — it can&apos;t confirm it&apos;s
          specifically running the new secret, since that&apos;s never exposed by the API.
        </p>
      </div>

      <h2 id="hosts">Hosts & apps</h2>
      <p className="lead">
        Virtual hosts, their TLS settings, and the applications inside them with the inputs they accept and outputs
        they serve.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>&quot;declared in Server.xml&quot; badge</dt>
          <dd>This vhost or app was defined by editing the config file directly — it can be inspected here but only changed on disk, then the engine restarted.</dd>
          <dt>Inputs accepted / Outputs served toggles</dt>
          <dd>Editable only for a dynamic (console-created) app — toggling one restarts that app and disconnects everyone on it.</dd>
          <dt>Reload certificate</dt>
          <dd>Re-reads this vhost&apos;s TLS certificate from disk without a full restart.</dd>
        </dl>
        <p className="note">Engineer role required for this whole page.</p>
      </div>

      <h2 id="stats">Statistics & alerts</h2>
      <p className="lead">Server, host, app and stream counters, plus the alert rules the engine evaluates.</p>
      <div className="pane">
        <dl className="kv">
          <dt>Alert rules table</dt>
          <dd>Each rule&apos;s current state (ok / firing) is visible to everyone; who gets notified is only visible to, and only editable by, Engineers.</dd>
          <dt>+ email</dt>
          <dd>Adds an email address to notify when that specific rule fires or resolves.</dd>
        </dl>
      </div>

      <h2 id="logs">Logs</h2>
      <p className="lead">A live tail of the engine&apos;s own log file.</p>
      <div className="pane">
        <dl className="kv">
          <dt>Filter</dt>
          <dd>Shows only lines containing this text, e.g. a stream name — updates as you type.</dd>
          <dt>Line color</dt>
          <dd>Red for error/critical lines, amber for warnings, plain for everything else.</dd>
        </dl>
      </div>

      <h2 id="admin">Users, other servers & audit log</h2>
      <p className="lead">Engineer-only administrative tools.</p>
      <div className="pane">
        <dl className="kv">
          <dt>Users & roles</dt>
          <dd>
            Create and delete accounts, assign a role, and reset anyone&apos;s password without knowing their old
            one. Each row&apos;s &quot;History&quot; link jumps to that user&apos;s own audit trail.
          </dd>
          <dt>Other servers</dt>
          <dd>
            Keeps a list of other OvenMediaEngine servers for future use — this console still only operates against
            the one it&apos;s configured for. &quot;Test connection&quot; is a one-off reachability check; adding a
            server here doesn&apos;t connect the console to it.
          </dd>
          <dt>Audit log</dt>
          <dd>
            Every write the console has made — who, what, and when — for the most recent 500 entries. The Search
            field matches actor, target and detail together.
          </dd>
        </dl>
      </div>

      <h2 id="account">My account</h2>
      <p className="lead">Change your own password. Available to every signed-in user, regardless of role.</p>
      <div className="pane">
        <dl className="kv">
          <dt>Current password</dt>
          <dd>Required to confirm it&apos;s really you before setting a new one.</dd>
          <dt>New password</dt>
          <dd>At least 8 characters, confirmed by re-typing it.</dd>
        </dl>
      </div>

      <h2 id="roles">Roles</h2>
      <p className="lead">
        Each role includes everything the one below it can do — Engineer implies Operator implies Viewer.
      </p>
      <div className="pane">
        <dl className="kv">
          <dt>Viewer</dt>
          <dd>Multiviewer, streams, statistics and alert state, logs, and their own account.</dd>
          <dt>Operator</dt>
          <dd>+ push targets, recording, channels, publish keys &amp; links, and adding pull sources.</dd>
          <dt>Engineer</dt>
          <dd>
            + output profiles, hosts &amp; apps, access settings, alert routing, users &amp; roles, other servers,
            and the audit log.
          </dd>
        </dl>
      </div>
    </>
  );
}
