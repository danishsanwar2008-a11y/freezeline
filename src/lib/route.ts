// Where a crew is along its route at a moment, and how long it has left (client-safe, pure).
// Crews drive in real time (CREW_TIME_SCALE in crewTrip.ts, 1 = real time): the position comes from the real
// time since the crew was dispatched, so it keeps moving whether the replay plays or pauses, and does not
// jump when the replay hour changes.

import { drivenMinutes, milesBetween } from "./crewTrip";

export { CREW_TIME_SCALE, drivenMinutes, onJob } from "./crewTrip";

type Job = { assigned_at: string; minutes: number };

/** Fraction of the drive done (0 at the depot, 1 at the home). */
export function driveFraction(job: Job, now: number): number {
  return Math.min(1, drivenMinutes(job, now) / Math.max(1, job.minutes));
}

/** Whole minutes left until the crew arrives (0 once there). Counts down in the same real time. */
export function minutesLeft(job: Job, now: number): number {
  return Math.max(0, Math.ceil(job.minutes - drivenMinutes(job, now)));
}

type LngLat = [number, number];

// Cumulative miles along each path (paths are fixed per job, so this is computed once per path).
const lengths = new WeakMap<LngLat[], number[]>();
function cumulative(path: LngLat[]): number[] {
  let c = lengths.get(path);
  if (!c) {
    c = [0];
    for (let k = 1; k < path.length; k++) c.push(c[k - 1] + milesBetween(path[k - 1][1], path[k - 1][0], path[k][1], path[k][0]));
    lengths.set(path, c);
  }
  return c;
}

/**
 * The point at fraction t along a path, measured by distance, the rest of the path from there, and the
 * street segment it is on (from → to), which gives the direction of travel.
 * path: [lng, lat][] with at least one point.
 */
export function alongPath(path: LngLat[], t: number): { position: LngLat; rest: LngLat[]; segment: [LngLat, LngLat] | null } {
  const last = path.length - 1;
  // The last segment with a length (a route can repeat a point), for a vehicle parked at the end.
  const lastSegment = (): [LngLat, LngLat] | null => {
    for (let k = last; k > 0; k--) if (path[k][0] !== path[k - 1][0] || path[k][1] !== path[k - 1][1]) return [path[k - 1], path[k]];
    return null;
  };
  if (last === 0) return { position: path[0], rest: path, segment: null };
  const c = cumulative(path);
  const total = c[last];
  if (total === 0) return { position: path[0], rest: path, segment: null };
  if (t <= 0) {
    let k = 1;
    while (c[k] === 0) k++; // first segment with a length
    return { position: path[0], rest: path, segment: [path[k - 1], path[k]] };
  }
  if (t >= 1) return { position: path[last], rest: [path[last]], segment: lastSegment() };
  const target = t * total;
  // Binary search for the segment that holds the target distance.
  let lo = 1, hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  const k = lo;
  const d = c[k] - c[k - 1];
  const f = d === 0 ? 0 : (target - c[k - 1]) / d;
  const [x0, y0] = path[k - 1], [x1, y1] = path[k];
  const position: LngLat = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  return { position, rest: [position, ...path.slice(k)], segment: [path[k - 1], path[k]] };
}
