// Record the real FreezeLine console as a video, for the demo edit.
//
// The console renders from the bundled Uri data (data/uri-2021.json and the OSM files), so it
// needs no Supabase and no API key: LLM_PROVIDER=pregenerated makes "Run agent" use the rules
// path. This starts the app, signs in with the console password, and films the beats a demo
// needs: the map, a timeline scrub, Run agent, the decision trace, a hex zoom.
//
// Usage: node scripts/record-console.mjs [outDir]
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
// `playwright` (not playwright-core) so it finds its own browser: npm i -D playwright
// && npx playwright install chromium. PLAYWRIGHT_CHROME overrides the binary if needed.
import { chromium } from "playwright";

const OUT = process.argv[2] ?? "artifacts/demo";
const PORT = 3100;
const PASSWORD = "demopass123";
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.PLAYWRIGHT_CHROME || undefined;

mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log("[record]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(1000);
  }
  return false;
}

const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  env: {
    ...process.env,
    CONSOLE_PASSWORD: PASSWORD,
    LLM_PROVIDER: "pregenerated",
    NEXT_TELEMETRY_DISABLED: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => process.stdout.write(`[next] ${d}`));
server.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));

let failed = false;
try {
  if (!(await waitForServer())) throw new Error("the dev server never answered");
  log("server up");

  const browser = await chromium.launch({
    ...(CHROME ? { executablePath: CHROME } : {}),
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();

  // Sign in the way a person would, so the film shows a real session.
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/console/, { timeout: 60_000 });
  log("signed in");

  // The map is a canvas; give deck.gl time to draw before anything is filmed.
  await page.waitForSelector("canvas", { timeout: 60_000 });
  await sleep(6000);
  await page.screenshot({ path: `${OUT}/01-map.png` });
  log("map captured");

  // Slow orbit: a still map reads as a screenshot, a moving one reads as a product.
  await page.mouse.move(960, 540);
  await page.mouse.down();
  await page.mouse.move(1120, 500, { steps: 40 });
  await page.mouse.up();
  await sleep(1500);

  // Run agent, then let the decision trace fill.
  const runButton = page.getByRole("button", { name: /run agent/i });
  if (await runButton.count()) {
    await runButton.first().click();
    await sleep(2500);
    await page.screenshot({ path: `${OUT}/02-decisions.png` });
    log("decision trace captured");
    await sleep(5000);
  } else {
    log("no Run agent button found");
  }

  // Zoom into a hex / home if the map accepts a click, then hold for the edit.
  await page.mouse.click(980, 560);
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/03-detail.png` });
  await sleep(1500);

  const video = page.video();
  await context.close();
  await browser.close();
  if (video) log("video saved:", await video.path());
} catch (err) {
  failed = true;
  console.error("[record] failed:", err instanceof Error ? err.message : err);
} finally {
  server.kill("SIGTERM");
  await sleep(1500);
  server.kill("SIGKILL");
  process.exit(failed ? 1 : 0);
}
