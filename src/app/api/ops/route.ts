import { requireConsole } from "@/lib/server/consoleAuth";
import { getCity, hourIndex } from "@/lib/server/cityState";
import { getCrews, loadCrewJobs, loadHourRecords } from "@/lib/server/outreachState";
import { routedTrip } from "@/lib/server/crewRoutes";
import { STATUS_OF, type HomeStatus } from "@/lib/household";
import { STATUS_CODE } from "@/lib/riskScale";
import { needsList } from "@/lib/cityWording";
import type { ReasonFactor } from "@/lib/household";

// City Operations data for one replay hour: each home's status (one letter per home, in the same
// order as the console's home list), the outreach funnel, crews and the crew queue.
// Officials only (the /console); never used by homeowner pages.
export async function GET(req: Request) {
  const denied = requireConsole(req);
  if (denied) return denied;
  const time = new URL(req.url).searchParams.get("time") ?? "";
  if (hourIndex(time) < 0) return Response.json({ error: "Unknown replay time" }, { status: 400 });
  try {
    const [city, records, crews] = await Promise.all([getCity(), loadHourRecords(time), getCrews()]);
    let statuses = "";
    let texted = 0, called = 0, doorChecks = 0, neighborFlags = 0;
    const needsCrewIds: string[] = [];
    for (const h of city.homes) {
      const c = records.calls.get(h.id);
      const status: HomeStatus = c ? STATUS_OF[c.assessment] : "not_contacted";
      statuses += STATUS_CODE[status];
      if (!c) continue;
      if (c.contact !== "none") texted++;
      if (c.contact === "called" || c.contact === "door") called++;
      if (c.contact === "door") doorChecks++;
      if (c.flagged_by) neighborFlags++;
      if (c.assessment === "needs_crew" && c.confidence === "confirmed") needsCrewIds.push(h.id);
    }
    const jobs = await loadCrewJobs(city, time, crews);
    const home = (id: string) => city.homes[city.byId.get(id)!];
    const area = (zoneId?: string) => city.zones.find((z) => z.id === zoneId)?.neighborhood ?? "";
    // Confirmed "needs a crew" homes this hour that no crew has been assigned to yet.
    const waiting = needsCrewIds.filter((id) => !jobs.helpedHomes.has(id)).length;
    return Response.json({
      available: records.available,
      ran: records.calls.size > 0,
      statuses,
      funnel: { texted, called, doorChecks, neighborFlags },
      crews: crews.map((c) => {
        const j = jobs.active.find((x) => x.crew_id === c.id);
        const h = j ? home(j.home_id) : null;
        const reasons = (j ? (records.calls.get(j.home_id)?.reason_key ?? "") : "").split(",").filter(Boolean) as ReasonFactor[];
        const trip = h ? routedTrip(c, h) : null;
        return {
          ...c,
          area: area(c.zone_id),
          assignment:
            j && h && trip
              ? {
                  home_id: h.id,
                  street: h.street,
                  lat: h.lat,
                  lng: h.lng,
                  needs: needsList(reasons),
                  assigned_at: j.assigned_at,
                  miles: Math.round(trip.miles * 10) / 10,
                  minutes: trip.minutes,
                  /** The drive along real streets, [lng, lat] from depot to home (straight line if no route was found). */
                  route: trip.path,
                  routed: trip.routed,
                  hoursAgo: j.hoursAgo,
                  otherArea: h.zone_id !== c.zone_id,
                }
              : null,
        };
      }),
      crewQueue: waiting,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
