/**
 * Post-deploy smoke test of the production build in a clean browser (no service worker, no dev server quirks):
 * the map fills the screen and draws, spots load, no uncaught errors.
 *   npx tsx scripts/smoke-live.ts [https://site.example.test]
 * It exists because the dev server and the production build order their CSS differently (a lazy MapLibre stylesheet once
 * collapsed the map container to 300 px only in production).
 */
import { chromium } from "@playwright/test";

const origin = process.argv[2] ?? "https://site.example.test";
const browser = await chromium.launch();
const failures: string[] = [];
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
