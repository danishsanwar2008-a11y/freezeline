// Which home the demo call stands in for (src/lib/server/demoCall.ts). Pure and tested.
//
// The call goes out at every replay hour: before the storm it is the pre-survey that warns people
// and puts each home in its category; during the storm the forecast in the call does the rest.
// So: the highest-risk home that needs action (Watch or High), and when none does (a calm hour,
// every home Low) still the highest-risk home, so Run agent always makes the call.

export interface ScoredHome {
  level: "Low" | "Medium" | "High";
  score: number;
}

/** Index of the home to call, or null only when there are no homes at all. Ties: the first. */
export function demoHomeIndex(homes: readonly ScoredHome[]): number | null {
  let best = -1;
  let bestAny = -1;
  homes.forEach((h, i) => {
    if (bestAny < 0 || h.score > homes[bestAny].score) bestAny = i;
    if (h.level !== "Low" && (best < 0 || h.score > homes[best].score)) best = i;
  });
  if (best >= 0) return best;
  return bestAny >= 0 ? bestAny : null;
}
