// MapLibre 6 finds its web worker relative to its own bundle URL, which Next/Turbopack rewrites.
// Serve the self-contained worker from /public instead (RiskMap calls setWorkerUrl).
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/maplibre-gl-worker.mjs");
