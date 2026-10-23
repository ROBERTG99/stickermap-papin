/**
 * Headless screenshot of a page of the running dev server (http://localhost:5173) for visual checks.
 *
 *   npx tsx scripts/shot.ts /nuevo build/shots/add.png [--desktop] [--dark] [--full] [--wait ".mp-sheet"]
 *       [--click "text=Filtros"] [--geo -34.9,-56.16] [--reduce-motion]
 *
 * Mobile (390x844, touch) by default; --desktop is 1440x900. Prints console errors and failed requests.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const [pathArg = "/", out = "build/shots/shot.png", ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.includes(name);
const value = (name: string) => rest[rest.indexOf(name) + 1];
const desktop = flag("--desktop");

const browser = await chromium.launch();
const [lat, lng] = (value("--geo") ?? "").split(",").map(Number);
const context = await browser.newContext({
  viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
  deviceScaleFactor: desktop ? 1 : 2,
  hasTouch: !desktop,
  isMobile: !desktop,
  colorScheme: flag("--dark") ? "dark" : "light",
  reducedMotion: flag("--reduce-motion") ? "reduce" : "no-preference",
  locale: "es-UY",
  ...(flag("--geo") ? { geolocation: { latitude: lat!, longitude: lng! }, permissions: ["geolocation"] } : {}),
});
const page = await context.newPage();
const problems: string[] = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
await page.goto(`http://localhost:5173${pathArg}`, { waitUntil: "networkidle" });
if (value("--wait")) await page.waitForSelector(value("--wait")!, { timeout: 15000 });
if (value("--click")) { await page.click(value("--click")!); await page.waitForTimeout(600); }
await page.waitForTimeout(500);
await mkdir(dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: flag("--full") });
console.log(`saved ${out}`);
if (problems.length) console.log(problems.join("\n"));
await browser.close();
