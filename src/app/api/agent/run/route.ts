import { requireConsole } from "@/lib/server/consoleAuth";
import { z } from "zod";
import { getCity, hourIndex } from "@/lib/server/cityState";
import { runAgent } from "@/lib/server/agent/run";

// Runs only when the official clicks "Run agent" (never per frame). Server-side only.
export const maxDuration = 120;

const Body = z.object({ time: z.string(), mode: z.enum(["auto", "approve"]) });

export async function POST(req: Request) {
  const denied = requireConsole(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { time, mode }" }, { status: 400 });
  const hour = hourIndex(parsed.data.time);
  if (hour < 0) return Response.json({ error: "Unknown replay time" }, { status: 400 });
  try {
    const city = await getCity();
    const result = await runAgent(city, hour, parsed.data.mode, new URL(req.url).origin);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
