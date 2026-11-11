import { z } from "zod";
import { getCity, hourIndex } from "@/lib/server/cityState";
import { executeApproved } from "@/lib/server/agent/run";

// Approve mode: executes one previewed action after the official clicks Approve.
// The action's arguments are re-validated server-side before anything is written.
const Body = z.object({
  time: z.string(),
  pending: z.object({
    tool: z.enum(["publish_drip_plan", "queue_outreach", "simulate_outreach", "propose_crew", "log_event", "send_stage2_alert"]),
    args: z.unknown(),
    reserves: z.record(z.string(), z.number()),
  }),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected { time, pending }" }, { status: 400 });
  const hour = hourIndex(parsed.data.time);
  if (hour < 0) return Response.json({ error: "Unknown replay time" }, { status: 400 });
  try {
    const city = await getCity();
    const entry = await executeApproved(city, hour, new URL(req.url).origin, parsed.data.pending);
    return Response.json({ entry });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
