// Weather times are local Houston wall-clock strings ("2021-02-16T06:00"). Feb 2021 is CST.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(time: string) {
  const [date, clock] = time.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, clock };
}

/** "Tue, Feb 16 · 06:00 CST" */
export function formatHour(time: string) {
  const { y, m, d, clock } = parts(time);
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow}, ${MONTHS[m - 1]} ${d} · ${clock} CST`;
}

/** "Feb 16" */
export function formatDay(time: string) {
  const { m, d } = parts(time);
  return `${MONTHS[m - 1]} ${d}`;
}

export const fmtF = (n: number) => `${n.toFixed(1)}°F`;
