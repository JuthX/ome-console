import type {
  AppInfo,
  CreateMultiplexChannelRequest,
  CreateOutputProfileRequest,
  CreatePullStreamRequest,
  CreateScheduledChannelRequest,
  MultiplexChannelInfo,
  OmeEnvelope,
  OmeStatsInfo,
  OmeStreamInfo,
  OmeVersionResponse,
  OutputProfileInfo,
  PushTask,
  RecordTask,
  ScheduledChannelInfo,
  SendEventRequest,
  SendSubtitlesRequest,
  StartHlsDumpRequest,
  StartPushRequest,
  StartRecordRequest,
  VhostInfo,
} from "./types";

/** Any non-2xx response from the OME REST API. */
export class OmeApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "OmeApiError";
  }
}

/**
 * A write OME rejected because the target is declared in Server.xml
 * (PRD §6 constraint #1) — the UI should show a "declared in Server.xml"
 * badge for this, never a silently-disabled control. Not yet thrown by
 * anything in Sprint 2 (no writes exist yet); wired up as write endpoints
 * are added from Sprint 4 onward.
 */
export class OmeConfigDeclaredError extends OmeApiError {
  constructor(message: string) {
    super(message, 403);
    this.name = "OmeConfigDeclaredError";
  }
}

export interface OmeClientConfig {
  baseUrl: string;
  accessToken: string;
}

/**
 * Thin, typed wrapper over OME's REST API. Server-side only — the
 * AccessToken must never reach the browser bundle, so this must only be
 * imported from route handlers / server actions / server components.
 */
export class OmeClient {
  constructor(private readonly config: OmeClientConfig) {}

  private authHeader(): string {
    // Confirmed against a real v0.21.0 instance (Sprint 1): the raw
    // AccessToken alone, base64-encoded — no "user:" prefix despite some
    // third-party docs describing it as user-id:password Basic auth.
    return "Basic " + Buffer.from(this.config.accessToken, "utf8").toString("base64");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader(),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    // OME's own errors are JSON, but an intermediary (or OME itself, on a
    // truly broken request) can return an empty body or an HTML/plain-text
    // error page — don't let a raw SyntaxError escape instead of the typed
    // errors below, which callers rely on to tell "config-declared" apart
    // from a generic failure.
    let body: OmeEnvelope<T>;
    try {
      body = (await res.json()) as OmeEnvelope<T>;
    } catch {
      throw new OmeApiError(res.statusText || `Non-JSON response (HTTP ${res.status})`, res.status);
    }

    if (!res.ok) {
      if (res.status === 403) {
        throw new OmeConfigDeclaredError(body.message);
      }
      throw new OmeApiError(body.message, res.status);
    }

    return body.response;
  }

  getVersion(): Promise<OmeVersionResponse> {
    return this.request<OmeVersionResponse>("/v1/version");
  }

  listVhosts(): Promise<string[]> {
    return this.request<string[]>("/v1/vhosts");
  }

  listApps(vhost: string): Promise<string[]> {
    return this.request<string[]>(`/v1/vhosts/${vhost}/apps`);
  }

  // Sprint 6: hosts & apps + output profiles. `AppInfo.dynamic === false`
  // means the app is declared in Server.xml — PRD §6 #1: read-only via API,
  // the console shows a badge rather than a disabled control and lets the
  // operator's write attempt hit the real 403.
  getVhost(vhost: string): Promise<VhostInfo> {
    return this.request<VhostInfo>(`/v1/vhosts/${vhost}`);
  }

  reloadCertificate(vhost: string): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}:reloadCertificate`, { method: "POST" });
  }

  getApp(vhost: string, app: string): Promise<AppInfo> {
    return this.request<AppInfo>(`/v1/vhosts/${vhost}/apps/${app}`);
  }

  /** Cannot change `name` or `outputProfiles` (PRD §6 #3) — only providers/publishers sub-fields. */
  patchApp(vhost: string, app: string, body: Record<string, unknown>): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  getAppStats(vhost: string, app: string): Promise<OmeStatsInfo> {
    return this.request<OmeStatsInfo>(`/v1/stats/current/vhosts/${vhost}/apps/${app}`);
  }

  listOutputProfiles(vhost: string, app: string): Promise<string[]> {
    return this.request<string[]>(`/v1/vhosts/${vhost}/apps/${app}/outputProfiles`);
  }

  getOutputProfile(vhost: string, app: string, name: string): Promise<OutputProfileInfo> {
    return this.request<OutputProfileInfo>(`/v1/vhosts/${vhost}/apps/${app}/outputProfiles/${name}`);
  }

  /** Restarts the app on success — documented explicitly, not just implied (PRD §6 #2). */
  createOutputProfile(vhost: string, app: string, body: CreateOutputProfileRequest): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}/outputProfiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([body]),
    });
  }

  /** No PATCH exists for output profiles — editing means delete + re-create. Restarts the app. */
  deleteOutputProfile(vhost: string, app: string, name: string): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}/outputProfiles/${name}`, { method: "DELETE" });
  }

  listStreams(vhost: string, app: string): Promise<string[]> {
    return this.request<string[]>(`/v1/vhosts/${vhost}/apps/${app}/streams`);
  }

  getStreamInfo(vhost: string, app: string, stream: string): Promise<OmeStreamInfo> {
    return this.request<OmeStreamInfo>(`/v1/vhosts/${vhost}/apps/${app}/streams/${stream}`);
  }

  getStreamStats(vhost: string, app: string, stream: string): Promise<OmeStatsInfo> {
    return this.request<OmeStatsInfo>(`/v1/stats/current/vhosts/${vhost}/apps/${app}/streams/${stream}`);
  }

  getVhostStats(vhost: string): Promise<OmeStatsInfo> {
    return this.request<OmeStatsInfo>(`/v1/stats/current/vhosts/${vhost}`);
  }

  private postAction<T>(vhost: string, app: string, action: string, body: unknown): Promise<T> {
    return this.request<T>(`/v1/vhosts/${vhost}/apps/${app}:${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Sprint 4: push publishing. Reserves automatically (PRD §6 #5) if the
  // named output stream doesn't exist yet, and starts once it appears.
  startPush(vhost: string, app: string, body: StartPushRequest): Promise<PushTask> {
    return this.postAction<PushTask>(vhost, app, "startPush", body);
  }

  stopPush(vhost: string, app: string, id: string): Promise<void> {
    return this.postAction<void>(vhost, app, "stopPush", { id });
  }

  async listPushes(vhost: string, app: string): Promise<PushTask[]> {
    return this.postAction<PushTask[]>(vhost, app, "pushes", {});
  }

  // Sprint 4: recording. Same auto-reserve behavior as push.
  startRecord(vhost: string, app: string, body: StartRecordRequest): Promise<RecordTask> {
    return this.postAction<RecordTask>(vhost, app, "startRecord", body);
  }

  stopRecord(vhost: string, app: string, id: string): Promise<void> {
    return this.postAction<void>(vhost, app, "stopRecord", { id });
  }

  async listRecords(vhost: string, app: string): Promise<RecordTask[]> {
    return this.postAction<RecordTask[]>(vhost, app, "records", {});
  }

  // Sprint 4b: LLHLS dump/conclude + stream actions. Unlike push/record,
  // these put the target stream in the URL path, not the body (confirmed
  // against a real instance).
  private postStreamAction<T>(
    vhost: string,
    app: string,
    stream: string,
    action: string,
    body: unknown,
  ): Promise<T> {
    return this.request<T>(`/v1/vhosts/${vhost}/apps/${app}/streams/${stream}:${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  startHlsDump(vhost: string, app: string, stream: string, body: StartHlsDumpRequest): Promise<void> {
    return this.postStreamAction<void>(vhost, app, stream, "startHlsDump", body);
  }

  stopHlsDump(vhost: string, app: string, stream: string, id: string): Promise<void> {
    return this.postStreamAction<void>(vhost, app, stream, "stopHlsDump", { outputStreamName: stream, id });
  }

  concludeHlsLive(vhost: string, app: string, stream: string): Promise<void> {
    return this.postStreamAction<void>(vhost, app, stream, "concludeHlsLive", {});
  }

  sendEvent(vhost: string, app: string, stream: string, body: SendEventRequest): Promise<void> {
    return this.postStreamAction<void>(vhost, app, stream, "sendEvent", body);
  }

  sendSubtitles(vhost: string, app: string, stream: string, body: SendSubtitlesRequest): Promise<void> {
    return this.postStreamAction<void>(vhost, app, stream, "sendSubtitles", body);
  }

  deleteStream(vhost: string, app: string, stream: string): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}/streams/${stream}`, { method: "DELETE" });
  }

  createPullStream(vhost: string, app: string, body: CreatePullStreamRequest): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}/streams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Sprint 5b: scheduled + multiplex channels. Plain REST resources — no
  // `:action` suffix — and the create body's stream/outputStream name
  // doubles as the channel's own identifier.
  listScheduledChannels(vhost: string, app: string): Promise<string[]> {
    return this.request<string[]>(`/v1/vhosts/${vhost}/apps/${app}/scheduledChannels`);
  }

  getScheduledChannel(vhost: string, app: string, name: string): Promise<ScheduledChannelInfo> {
    return this.request<ScheduledChannelInfo>(`/v1/vhosts/${vhost}/apps/${app}/scheduledChannels/${name}`);
  }

  createScheduledChannel(vhost: string, app: string, body: CreateScheduledChannelRequest): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}/scheduledChannels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  deleteScheduledChannel(vhost: string, app: string, name: string): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}/scheduledChannels/${name}`, { method: "DELETE" });
  }

  listMultiplexChannels(vhost: string, app: string): Promise<string[]> {
    return this.request<string[]>(`/v1/vhosts/${vhost}/apps/${app}/multiplexChannels`);
  }

  getMultiplexChannel(vhost: string, app: string, name: string): Promise<MultiplexChannelInfo> {
    return this.request<MultiplexChannelInfo>(`/v1/vhosts/${vhost}/apps/${app}/multiplexChannels/${name}`);
  }

  createMultiplexChannel(vhost: string, app: string, body: CreateMultiplexChannelRequest): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}/multiplexChannels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  deleteMultiplexChannel(vhost: string, app: string, name: string): Promise<void> {
    return this.request<void>(`/v1/vhosts/${vhost}/apps/${app}/multiplexChannels/${name}`, { method: "DELETE" });
  }

  /** Every stream across every vhost/app this server knows about. */
  async listAllStreams(): Promise<{ vhost: string; app: string; stream: string }[]> {
    const vhosts = await this.listVhosts();
    const result: { vhost: string; app: string; stream: string }[] = [];
    for (const vhost of vhosts) {
      const apps = await this.listApps(vhost);
      for (const app of apps) {
        const streams = await this.listStreams(vhost, app);
        for (const stream of streams) {
          result.push({ vhost, app, stream });
        }
      }
    }
    return result;
  }
}

let sharedClient: OmeClient | undefined;

/** The console talks to exactly one OME instance for now (PRD §5 v1 scope). */
export function getOmeClient(): OmeClient {
  if (!sharedClient) {
    const baseUrl = process.env.OME_API_BASE_URL;
    const accessToken = process.env.OME_ACCESS_TOKEN;
    if (!baseUrl || !accessToken) {
      throw new Error("OME_API_BASE_URL and OME_ACCESS_TOKEN must be set");
    }
    sharedClient = new OmeClient({ baseUrl, accessToken });
  }
  return sharedClient;
}
