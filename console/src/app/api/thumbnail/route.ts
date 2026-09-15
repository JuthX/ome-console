import { NextRequest } from "next/server";

// Thumbnails are never exposed publicly (see plan's port-design notes) even
// though the Thumbnail publisher happens to share OME's public LLHLS/WebRTC
// port — the console fetches them server-side over the internal network and
// re-serves them, so the only public surface stays LLHLS/WebRTC playback.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const app = searchParams.get("app");
  const stream = searchParams.get("stream");
  if (!app || !stream) {
    return new Response("app and stream are required", { status: 400 });
  }

  const base = process.env.OME_MEDIA_BASE_URL;
  if (!base) {
    return new Response("OME_MEDIA_BASE_URL is not configured", { status: 500 });
  }

  const upstream = await fetch(`${base}/${encodeURIComponent(app)}/${encodeURIComponent(stream)}/thumb.jpg`, {
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "no-store",
    },
  });
}
