// Where a crew is along its route at a moment, and how long it has left (client-safe, pure).
// The drive runs on a simulated clock so the demo can show it: one simulated minute = 2 s on screen.
// A job assigned in an earlier replay hour has been driving for those whole hours.

import { milesBetween } from "./crewTrip";

/** On screen, one simulated minute of driving takes this long (a 6-minute drive animates for 12 s). */
export const MS_PER_DRIVE_MINUTE = 2_000;

/** Simulated minutes the crew has driven so far. */
export function drivenMinutes(job: { hoursAgo: number; assigned_at: string }, now: number): number {
  if (job.hoursAgo > 0) return job.hoursAgo * 60;
  return Math.max(0, (now - Date.parse(job.assigned_at)) / MS_PER_DRIVE_MINUTE);
}

/** Fraction of the drive done (0 at the depot, 1 at the home). */
export function driveFraction(job: { hoursAgo: number; assigned_at: string; minutes: number }, now: number): number {
  return Math.min(1, drivenMinutes(job, now) / Math.max(1, job.minutes));
}

/** Whole minutes left until the crew arrives (0 once there). */
export function minutesLeft(job: { hoursAgo: number; assigned_at: string; minutes: number }, now: number): number {
  return Math.max(0, Math.ceil(job.minutes - drivenMinutes(job, now)));
}

/**
 * The point at fraction t along a path, measured by distance, plus the rest of the path from there.
 * path: [lng, lat][] with at least one point.
 */
export function alongPath(path: [number, number][], t: number): { position: [number, number]; rest: [number, number][] } {
  if (path.length === 1 || t <= 0) return { position: path[0], rest: path };
  const seg: number[] = [];
  let total = 0;
  for (let k = 1; k < path.length; k++) {
    const d = milesBetween(path[k - 1][1], path[k - 1][0], path[k][1], path[k][0]);
    seg.push(d);
    total += d;
  }
  if (t >= 1 || total === 0) return { position: path[path.length - 1], rest: [path[path.length - 1]] };
  let target = t * total;
  for (let k = 1; k < path.length; k++) {
    const d = seg[k - 1];
    if (target <= d) {
      const f = d === 0 ? 0 : target / d;
      const [x0, y0] = path[k - 1], [x1, y1] = path[k];
      const position: [number, number] = [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
      return { position, rest: [position, ...path.slice(k)] };
    }
    target -= d;
  }
  return { position: path[path.length - 1], rest: [path[path.length - 1]] };
}
