// Downloads Uri weather for each neighborhood's center in one Open-Meteo request
// and caches it as data/uri-2021-neighborhoods.json (keyed by zone id).
// Usage: npm run weather:neighborhoods            (fetches only areas not in the file yet; cached areas are kept)
//        npm run weather:neighborhoods -- --all   (re-fetches every area)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateZones } from "../src/lib/seed/generate";
import { fetchArchiveWeatherMulti, type WeatherSeries } from "../src/lib/weather";

const FILE = "data/uri-2021-neighborhoods.json";

async function main() {
  const zones = generateZones();
  const cached: Record<string, WeatherSeries> =
    existsSync(FILE) && !process.argv.includes("--all") ? (JSON.parse(readFileSync(FILE, "utf8")) as { zones: Record<string, WeatherSeries> }).zones : {};
  const missing = zones.filter((z) => !cached[z.id]);
  const series = missing.length
    ? await fetchArchiveWeatherMulti(
        missing.map((z) => ({ latitude: z.center_lat, longitude: z.center_lng })),
        "2021-02-13",
        "2021-02-19",
      )
    : [];
  const fresh = Object.fromEntries(missing.map((z, i) => [z.id, series[i]]));
  const out = {
    note: "Open-Meteo archive (default model), one request per batch of neighborhood centers. Grid cells are ~9–25 km, so nearby neighborhoods differ only slightly.",
    zones: Object.fromEntries(zones.map((z) => [z.id, cached[z.id] ?? fresh[z.id]])),
  };
  mkdirSync("data", { recursive: true });
  writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n");
  for (const z of zones) {
    const t = out.zones[z.id].hours.map((h) => h.temperature_f);
    console.log(`${z.neighborhood}${fresh[z.id] ? " (new)" : ""}: low ${Math.min(...t)}°F, ${t.filter((x) => x < 20).length} hours below 20°F`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
