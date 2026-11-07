// Downloads Uri weather for each neighborhood's center in one Open-Meteo request
// and caches it as data/uri-2021-neighborhoods.json (keyed by zone id).
// Usage: npm run weather:neighborhoods
import { mkdirSync, writeFileSync } from "node:fs";
import { generateZones } from "../src/lib/seed/generate";
import { fetchArchiveWeatherMulti } from "../src/lib/weather";

async function main() {
  const zones = generateZones();
  const series = await fetchArchiveWeatherMulti(
    zones.map((z) => ({ latitude: z.center_lat, longitude: z.center_lng })),
    "2021-02-13",
    "2021-02-19",
  );
  const out = {
    note: "Open-Meteo archive (default model), one request for all neighborhood centers. Grid cells are ~9–25 km, so nearby neighborhoods differ only slightly.",
    zones: Object.fromEntries(zones.map((z, i) => [z.id, series[i]])),
  };
  mkdirSync("data", { recursive: true });
  writeFileSync("data/uri-2021-neighborhoods.json", JSON.stringify(out, null, 2) + "\n");
  for (const [i, z] of zones.entries()) {
    const t = series[i].hours.map((h) => h.temperature_f);
    console.log(`${z.neighborhood}: low ${Math.min(...t)}°F, ${t.filter((x) => x < 20).length} hours below 20°F`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
