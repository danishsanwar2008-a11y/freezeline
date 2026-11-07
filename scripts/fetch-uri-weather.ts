// Downloads hourly Houston weather for Winter Storm Uri and saves data/uri-2021.json.
// Usage: npm run weather:uri
import { mkdirSync, writeFileSync } from "node:fs";
import { fetchUriWeather } from "../src/lib/weather";

async function main() {
  const series = await fetchUriWeather();
  mkdirSync("data", { recursive: true });
  writeFileSync("data/uri-2021.json", JSON.stringify(series, null, 2) + "\n");
  const temps = series.hours.map((h) => h.temperature_f);
  console.log(
    `Saved ${series.hours.length} hours to data/uri-2021.json (min ${Math.min(...temps)}°F, max ${Math.max(...temps)}°F)`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
