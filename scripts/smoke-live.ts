/**
 * Post-deploy smoke test of the production build in a clean browser (no service worker, no dev server quirks):
 * the map fills the screen and draws, spots load, no uncaught errors.
 *   npx tsx scripts/smoke-live.ts <site origin>   (or SITE_ORIGIN in the environment)
 * It exists because the dev server and the production build order their CSS differently (a lazy MapLibre stylesheet once
 * collapsed the map container to 300 px only in production).
 */
import { chromium } from "@playwright/test";

const origin = process.argv[2] ?? process.env.SITE_ORIGIN;
if (!origin) throw new Error("pass the site origin as an argument or set SITE_ORIGIN");
const failures: string[] = [];

// v2 endpoints answer in the right shape (they work even while their feature flags are off)
const get = async (path: string) => {
  const res = await fetch(`${origin}${path}`);
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
};
const cfg = await get("/api/config");
if (cfg.status !== 200 || !(cfg.body as { features?: object } | null)?.features) failures.push("api/config: no feature flags");
const near = await get("/api/nearby?lat=-34.9061&lng=-56.1993&limit=3");
if (near.status !== 200 || !Array.isArray(near.body) || near.body.length === 0 || typeof (near.body[0] as { distance_m?: unknown }).distance_m !== "number") failures.push("api/nearby: unexpected answer");
const longevity = await get("/api/stats/longevity");
if (longevity.status !== 200 || typeof (longevity.body as { totals?: { alive?: number } } | null)?.totals?.alive !== "number") failures.push("api/stats/longevity: unexpected answer");
const media = await fetch(`${origin}/media/video/00000000000000000000000000.mp4`);
if (media.status !== 404) failures.push(`media/video of an unknown spot answered ${media.status}, expected 404`);
console.log("api", cfg.status, near.status, longevity.status, media.status);

const browser = await chromium.launch();
for (const [name, viewport] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 900 }]] as const) {
  const page = await (await browser.newContext({ viewport, serviceWorkers: "block" })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 20000 });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const map = (window as unknown as { __mapaPapinMap?: { getCanvas(): HTMLCanvasElement; querySourceFeatures(s: string): unknown[]; queryRenderedFeatures(): unknown[] } }).__mapaPapinMap;
    const c = map?.getCanvas().getBoundingClientRect();
    return { hasMap: !!map, w: c?.width ?? 0, h: c?.height ?? 0, spots: map?.querySourceFeatures("spots").length ?? 0, rendered: map?.queryRenderedFeatures().length ?? 0, markers: document.querySelectorAll(".mp-marker, .mp-cluster").length };
  });
  if (!m.hasMap) failures.push(`${name}: map instance missing`);
  if (m.h < viewport.height * 0.7 || m.w < viewport.width * 0.95) failures.push(`${name}: canvas ${m.w}x${m.h} does not fill ${viewport.width}x${viewport.height}`);
  if (m.spots === 0 || m.markers === 0) failures.push(`${name}: no spots/markers drawn (${JSON.stringify(m)})`);
  if (m.rendered === 0) failures.push(`${name}: base map drew nothing`);
  failures.push(...errors.map((e) => `${name}: page error ${e}`));
  console.log(name, JSON.stringify(m));
}
await browser.close();
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("smoke OK");
