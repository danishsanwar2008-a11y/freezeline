// PLACEHOLDER sign-ups (simulated) so the registrations table has data before real people sign up.
// Each one is linked to a real OpenStreetMap home and its survey answers follow that home's simulated
// details (pier-and-beam -> crawlspace pipes, etc.). Names are invented, emails use example.com and
// phone numbers use the 555-0100..0199 range reserved for fiction, so nobody real is ever contacted.
// Deterministic: same output every run, so `npm run seed:registrations` upserts the same rows.

import { generateHomes, hash32, rng, type HomeRow } from "./generate";
import type { PipeLocation, RegistrationInputRaw } from "../registration";

/** One ZIP per demo neighborhood. */
export const ZONE_ZIP: Record<string, string> = {
  heights: "77008",
  montrose: "77006",
  "third-ward": "77004",
  meyerland: "77096",
};

const FIRST = [
  "Maria", "James", "Linh", "Robert", "Aisha", "David", "Guadalupe", "Michael", "Priya", "William",
  "Rosa", "Jamal", "Emily", "Carlos", "Grace", "Thomas", "Fatima", "Daniel", "Mei", "Anthony",
  "Sofia", "Marcus", "Hannah", "Luis", "Olivia", "Kevin", "Esperanza", "Andre", "Claire", "Minh",
];
const LAST = [
  "Garcia", "Johnson", "Nguyen", "Williams", "Hernandez", "Brown", "Patel", "Davis", "Martinez", "Wilson",
  "Lopez", "Jackson", "Tran", "Thompson", "Gonzalez", "White", "Rodriguez", "Harris", "Kim", "Lewis",
];
/** Houston-area codes; with 555-01XX that is 400 distinct fictional numbers. */
const AREA_CODES = ["713", "281", "832", "346"];

export const PLACEHOLDERS_PER_AREA = 100;

export interface PlaceholderRegistration {
  homeId: string;
  input: RegistrationInputRaw;
}

/** k-th fictional number (0..399): "(713) 555-0142". */
export function fictionalPhone(k: number): string {
  const code = AREA_CODES[Math.floor(k / 100) % AREA_CODES.length];
  return `(${code}) 555-01${String(k % 100).padStart(2, "0")}`;
}

function pick<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length)];
}

function pipesFor(h: HomeRow, r: () => number): PipeLocation[] {
  if (r() < 0.08) return ["not_sure"];
  const p: PipeLocation[] = [];
  if (h.foundation === "pier_and_beam") p.push("crawlspace");
  if (r() < 0.12) p.push("garage");
  return p.length ? p : ["none"];
}

/** Placeholder sign-ups: `perArea` homes from each neighborhood, spread across the area. */
export function generatePlaceholderRegistrations(perArea = PLACEHOLDERS_PER_AREA, homes: HomeRow[] = generateHomes()): PlaceholderRegistration[] {
  const out: PlaceholderRegistration[] = [];
  for (const zone of Object.keys(ZONE_ZIP)) {
    const inZone = homes.filter((h) => h.zone_id === zone && h.street);
    const step = Math.max(1, Math.floor(inZone.length / perArea));
    for (let j = 0; j < perArea && j * step < inZone.length; j++) {
      const h = inZone[j * step];
      const k = out.length;
      const r = rng(hash32(`${h.id}|signup`));
      const first = FIRST[(k * 7 + Math.floor(r() * FIRST.length)) % FIRST.length];
      const last = pick(r, LAST);
      const apartment = r() < 0.06;
      const skippedSurvey = r() < 0.1; // some people leave the optional questions blank
      const hasContact = r() < 0.7;
      const contactFirst = pick(r, FIRST);

      out.push({
        homeId: h.id,
        input: {
          fullName: `${first} ${last}`,
          email: `${first}.${last}.${k + 1}@example.com`.toLowerCase(),
          phone: fictionalPhone(k),
          language: r() < 0.2 ? "es" : "en",
          addressLine1: `${100 + Math.floor(r() * 4900)} ${h.street}`,
          addressLine2: apartment ? `Apt ${1 + Math.floor(r() * 24)}` : "",
          city: zone === "meyerland" && r() < 0.15 ? "Bellaire" : "Houston",
          zip: ZONE_ZIP[zone],
          dwellingType: skippedSurvey ? "" : apartment ? "apartment" : "house",
          pipeLocations: skippedSurvey ? [] : pipesFor(h, r),
          knowsShutoff: skippedSurvey ? "" : r() < (h.year_built >= 1990 ? 0.75 : 0.6) ? "yes" : "no",
          hasGenerator: skippedSurvey ? "" : r() < 0.15 ? "yes" : "no",
          someoneHome3Days: skippedSurvey ? "" : h.elderly || r() < 0.7 ? "yes" : r() < 0.5 ? "no" : "not_sure",
          emergencyName: hasContact ? `${contactFirst} ${last}` : "",
          // A different fictional number than the person's own (offset by 200 in the 400-number pool).
          emergencyPhone: hasContact ? fictionalPhone((k + 200) % 400) : "",
          consent: true,
        },
      });
    }
  }
  return out;
}
