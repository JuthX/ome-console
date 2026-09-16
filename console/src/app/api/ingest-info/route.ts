import { NextRequest, NextResponse } from "next/server";

// Plain ingest connection strings for the add-input wizard — no revocable
// key/expiry yet (the `keys` table + admission webhook own that instead).
// SRT streamid format ({vhost}/{app}/{stream}) confirmed against a real
// v0.21.0 instance.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const vhost = searchParams.get("vhost");
  const app = searchParams.get("app");
  const stream = searchParams.get("stream");
  if (!vhost || !app || !stream) {
    return NextResponse.json({ error: "vhost, app and stream are required" }, { status: 400 });
  }

  const host = process.env.OME_HOST_IP;
  if (!host) {
    return NextResponse.json({ error: "OME_HOST_IP is not configured" }, { status: 500 });
  }
  const rtmpPort = process.env.OME_RTMP_PROV_PORT ?? "1935";
  const srtPort = process.env.OME_SRT_PROV_PORT ?? "9999";

  return NextResponse.json({
    srtUrl: `srt://${host}:${srtPort}?streamid=${vhost}/${app}/${stream}`,
    rtmpUrl: `rtmp://${host}:${rtmpPort}/${app}/${stream}`,
  });
}
