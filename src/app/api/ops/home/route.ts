import { requireConsole } from "@/lib/server/consoleAuth";
import { getCity, hourIndex } from "@/lib/server/cityState";
import { loadHomeRecord } from "@/lib/server/outreachState";
import { STATUS_OF, type ReasonFactor } from "@/lib/household";
import { assessmentSentence, STATUS_LABEL } from "@/lib/cityWording";

// One home's summary for the City Operations dot card (officials' third-person wording).
export async function GET(req: Request) {
  const denied = requireConsole(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  const time = q.get("time") ?? "";
  if (hourIndex(time) < 0) return Response.json({ error: "Unknown replay time" }, { status: 400 });
  const city = await getCity();
  const idx = city.byId.get(id);
  if (idx === undefined) return Response.json({ error: "Unknown home" }, { status: 404 });
  const h = city.homes[idx];
  const { call, assignment, crewName } = await loadHomeRecord(id, time);
  const status = call ? STATUS_OF[call.assessment] : "not_contacted";
  return Response.json({
    id: h.id,
    label: h.label,
    street: h.street,
    neighborhood: h.neighborhood,
    status,
    statusLabel: STATUS_LABEL[status],
    assessment: call ? assessmentSentence(call.assessment, call.reason_key.split(",") as ReasonFactor[]) : null,
    confidence: call?.confidence ?? null,
    flaggedByNeighbor: !!call?.flagged_by,
    crew: assignment?.status === "assigned" ? crewName : null,
  });
}
