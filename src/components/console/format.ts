// Weather times are local Houston wall-clock strings ("2021-02-16T06:00").
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(time: string) {
  const [date, clock] = time.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const hour = Number(clock.slice(0, 2));
  return { y, m, d, hour };
}

const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

/** "Tue, Feb 16 · 6 AM" */
export function formatHour(time: string) {
  const { y, m, d, hour } = parts(time);
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow}, ${MONTHS[m - 1]} ${d} · ${hour12(hour)}`;
}

/** "Feb 16" */
export function formatDay(time: string) {
  const { m, d } = parts(time);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Current Houston wall-clock hour as "YYYY-MM-DDTHH:00". */
export function houstonNowHour(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
}

export const fmtF = (n: number) => `${Math.round(n)}°F`;
