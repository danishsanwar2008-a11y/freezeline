import { getCity, hourIndex } from "@/lib/server/cityState";
import { getCrews, loadHourRecords } from "@/lib/server/outreachState";
import { STATUS_OF, type HomeStatus } from "@/lib/household";
import { STATUS_CODE } from "@/lib/riskScale";
import { needsList } from "@/lib/cityWording";
import type { ReasonFactor } from "@/lib/household";

// City Operations data for one replay hour: each home's status (one letter per home, in the same
// order as the console's home list), the outreach funnel, crews and the crew queue.
// Officials only (the /console); never used by homeowner pages.
export async function GET(req: Request) {
  const time = new URL(req.url).searchParams.get("time") ?? "";
  if (hourIndex(time) < 0) return Response.json({ error: "Unknown replay time" }, { status: 400 });
  try {
    const [city, records, crews] = await Promise.all([getCity(), loadHourRecords(time), getCrews()]);
    let statuses = "";
    let texted = 0, called = 0, doorChecks = 0, neighborFlags = 0, needsCrew = 0;
    for (const h of city.homes) {
      const c = records.calls.get(h.id);
      const status: HomeStatus = c ? STATUS_OF[c.assessment] : "not_contacted";
      statuses += STATUS_CODE[status];
      if (!c) continue;
      if (c.contact !== "none") texted++;
      if (c.contact === "called" || c.contact === "door") called++;
      if (c.contact === "door") doorChecks++;
      if (c.flagged_by) neighborFlags++;
      if (c.assessment === "needs_crew" && c.confidence === "confirmed") needsCrew++;
    }
    const assigned = records.assignments.filter((a) => a.status === "assigned" && a.crew_id);
    const home = (id: string) => city.homes[city.byId.get(id)!];
    return Response.json({
      available: records.available,
      ran: records.calls.size > 0,
      statuses,
      funnel: { texted, called, doorChecks, neighborFlags },
      crews: crews.map((c) => {
        const a = assigned.find((x) => x.crew_id === c.id);
        const h = a ? home(a.home_id) : null;
        const reasons = (a ? (records.calls.get(a.home_id)?.reason_key ?? "") : "").split(",").filter(Boolean) as ReasonFactor[];
        return {
          ...c,
          assignment: a && h ? { home_id: h.id, street: h.street, lat: h.lat, lng: h.lng, needs: needsList(reasons), assigned_at: a.created_at } : null,
        };
      }),
      crewQueue: Math.max(0, needsCrew - assigned.length),
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
