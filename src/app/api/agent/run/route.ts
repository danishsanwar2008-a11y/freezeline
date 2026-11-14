import { requireConsole } from "@/lib/server/consoleAuth";
import { z } from "zod";
import { getCity, hourIndex } from "@/lib/server/cityState";
import { runAgent } from "@/lib/server/agent/run";
import type { TraceEvent } from "@/lib/server/agent/tools";

// Runs only when the official clicks "Run agent" (never per frame). Server-side only.
// With ?stream=1 the run is streamed as it happens (one JSON object per line: plan / start / entry
// events, then a final { type: "done", result }), so the decision trace shows each step live.
export const maxDuration = 120;

const Body = z.object({ time: z.string(), mode: z.enum(["auto", "approve"]) });

export async function POST(req: Request) {
  const denied = requireConsole(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { time, mode }" }, { status: 400 });
  const hour = hourIndex(parsed.data.time);
  if (hour < 0) return Response.json({ error: "Unknown replay time" }, { status: 400 });
  const origin = new URL(req.url).origin;

  if (new URL(req.url).searchParams.get("stream") !== "1") {
    try {
      const city = await getCity();
      return Response.json(await runAgent(city, hour, parsed.data.mode, origin));
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // If the browser goes away mid-run, the run still finishes; later sends are dropped.
      let open = true;
      const send = (obj: TraceEvent | { type: "done"; result: unknown } | { type: "error"; error: string }) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        const city = await getCity();
        const result = await runAgent(city, hour, parsed.data.mode, origin, send);
        send({ type: "done", result });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
