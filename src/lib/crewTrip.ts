// Crew travel math (simulated assumptions). Tiny and dependency-free, so the console can import it.

/** Simulated crew travel and job assumptions (labeled in the UI). */
export const CREW_TRIP = {
  /** Streets aren't straight lines: straight-line distance x this. */
  roadFactor: 1.3,
  /** Average speed on icy streets. */
  mph: 15,
  /** Time on site helping a household do the steps. */
  jobMinutes: 30,
} as const;

/** Straight-line distance in miles (haversine). */
export function milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Road distance and drive time from a crew's depot to a home. */
export function crewTrip(crew: { depot_lat: number; depot_lng: number }, home: { lat: number; lng: number }): { miles: number; minutes: number } {
  const miles = milesBetween(crew.depot_lat, crew.depot_lng, home.lat, home.lng) * CREW_TRIP.roadFactor;
  return { miles, minutes: Math.max(1, Math.round((miles / CREW_TRIP.mph) * 60)) };
}

/** An assignment from this or an earlier replay hour. */
export interface CrewJob {
  crew_id: number;
  home_id: string;
  /** Replay hours since it was assigned (0 = this hour). */
  hoursAgo: number;
  /** Drive time for this job. */
  minutes: number;
}

/** A job lasts the drive plus time on site; after that the crew is back on standby. */
export const jobActive = (j: Pick<CrewJob, "hoursAgo" | "minutes">) => j.hoursAgo * 60 < j.minutes + CREW_TRIP.jobMinutes;
