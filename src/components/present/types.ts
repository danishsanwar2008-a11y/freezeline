// The /present deck's data (built on the server by src/lib/server/presentData.ts from the same
// functions the console uses). Plain JSON: arrays indexed like the replay (home order, hour order).

export interface PresentData {
  zones: { id: string; name: string; basePsi: number }[];
  hours: { time: string; temp: number; feels: number; below20: number }[];
  /** Hour index with the most High-risk homes. */
  peak: number;
  homes: { lng: number[]; lat: number[]; zone: number[]; vuln: number[] };
  /** Weather exposure 0-1, [zone][hour]. */
  exposure: number[][];
  /** [High, Watch, Low] home counts per hour. */
  counts: [number, number, number][];
  hexes: { h3: string; homes: number[] }[];
  pressure: {
    /** psi, [zone][hour]. */
    plan: number[][];
    blanket: number[][];
    noDrip: number[][];
    planBelow20: number;
    blanketBelow20: number;
    areaHours: number;
  };
  peakZones: { zone: number; high: number; dripping: number; budget: number; plan: number; blanket: number; noDrip: number }[];
  monitor: { zone: number; nowPsi: number; dripping: number; extraTaps: number; stage2: { stop: number; kitchenOnly: number; psiAfter: number } | null }[];
  outreach: {
    texted: number;
    called: number;
    doorChecks: number;
    neighborFlags: number;
    status: Record<"ready" | "needs_help" | "waiting" | "no_answer" | "not_contacted", number>;
    needsCrew: number;
    crewQueue: number;
    /** One status letter per home (STATUS_CODE in riskScale.ts). */
    codes: string;
    /** One letter per home: t texted, c called, d door check, - not contacted. */
    contact: string;
  };
  crews: { name: string; zone: number; depot: [number, number]; home: number; path: [number, number][]; minutes: number; miles: number }[];
}
