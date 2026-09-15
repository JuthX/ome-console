import { getLatestSnapshot, subscribeToSnapshots } from "@/stats-poller";

// One background poller (src/stats-poller) feeds every open connection here —
// browsers never poll OME directly (PRD §9).
export async function GET() {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: NodeJS.Timeout | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      send(getLatestSnapshot());
      unsubscribe = subscribeToSnapshots(send);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(": heartbeat\n\n")), 15000);
    },
    cancel() {
      // Called when the client disconnects (tab closed, navigation away) —
      // without this, every closed EventSource would leak a poller subscription.
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
