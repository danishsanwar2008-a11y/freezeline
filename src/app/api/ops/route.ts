import { getCity, hourIndex } from "@/lib/server/cityState";
import { getCrews, loadCrewJobs, loadHourRecords } from "@/lib/server/outreachState";
import { routedTrip } from "@/lib/server/crewRoutes";
import { STATUS_OF, currentJob, type HomeStatus } from "@/lib/household";
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
    // The map keeps jobs still driving or on site in real time, so a crew never jumps when the replay hour changes.
    const jobs = await loadCrewJobs(city, time, crews, Date.now());
    const home = (id: string) => city.homes[city.byId.get(id)!];
    const area = (zoneId?: string) => city.zones.find((z) => z.id === zoneId)?.neighborhood ?? "";
    // Confirmed "needs a crew" homes this hour that no crew has been assigned to yet.
    // Crews never leave their area, so each area keeps its own queue.
    const waitingIds = needsCrewIds.filter((id) => !jobs.helpedHomes.has(id));
    const crewQueueByArea: Record<string, number> = {};
    for (const id of waitingIds) {
      const z = home(id).zone_id;
      crewQueueByArea[z] = (crewQueueByArea[z] ?? 0) + 1;
    }
    return Response.json({
      available: records.available,
      ran: records.calls.size > 0,
      statuses,
      funnel: { texted, called, doorChecks, neighborFlags },
      crews: crews.map((c) => {
        const j = currentJob(jobs.active, c.id);
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
                }
              : null,
        };
      }),
      crewQueue: waitingIds.length,
      crewQueueByArea,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
