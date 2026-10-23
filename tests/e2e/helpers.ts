import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test as base, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { SpotCollection, SpotDetail, SpotFeature } from "../../src/shared/types";

/** Where the dev server keeps its local D1/R2 during e2e (set by playwright.config.ts, wiped by global-setup.ts). */
const STATE_DIR = resolve(".wrangler/e2e-state");
export const FIXTURES = resolve("tests/e2e/fixtures/generated");
export const BULK_DIR = join(FIXTURES, "bulk-50");

function dbFile(): string {
  const dir = join(STATE_DIR, "v3/d1/miniflare-D1DatabaseObject");
  const file = readdirSync(dir).find((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
  if (!file) throw new Error(`no local D1 file in ${dir}`);
  return join(dir, file);
}

/** Read-only query against the local e2e D1 (the dev server holds it open; sqlite serialises access). */
export function query<T extends Record<string, unknown>>(sql: string): T[] {
  const out = execFileSync("sqlite3", ["-json", "-cmd", ".timeout 8000", dbFile(), sql], { encoding: "utf8" }).trim();
  return out ? (JSON.parse(out) as T[]) : [];
}

/** The per-IP limits (10 single adds / hour, 3 batches / day, 200 batch spots / day) are per run, not per spec. */
export function resetRateLimits(): void {
  execFileSync("sqlite3", ["-cmd", ".timeout 8000", dbFile(), "DELETE FROM submissions_rl"], { encoding: "utf8" });
}

export interface SpotRow extends Record<string, unknown> {
  id: string;
  lat: number;
  lng: number;
  location_source: string;
  location_accuracy_m: number | null;
  taken_at: string | null;
  placer_status: string;
  reporter_raw: string | null;
  batch_id: string | null;
  status: string;
  photo_sha256: string | null;
}

export const spotRows = (where = "1=1"): SpotRow[] => query<SpotRow>(`SELECT * FROM spots WHERE ${where} ORDER BY created_at, id`);

export async function apiSpots(request: APIRequestContext): Promise<SpotFeature[]> {
  const res = await request.get("/api/spots", { headers: { "Cache-Control": "no-cache" } });
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as SpotCollection).features;
}

export async function apiSpot(request: APIRequestContext, id: string): Promise<SpotDetail> {
  const res = await request.get(`/api/spots/${id}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as SpotDetail;
}

/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * `test` with the external map tiles / style blocked: the app falls back to its plain land background, so specs never
 * wait on (or flake with) a third-party CDN. Photon and Nominatim are never reached either unless a spec mocks them.
 */
export const test = base.extend<{ offlineBasemap: void }>({
  offlineBasemap: [
    async ({ context }, use) => {
      await context.route(/(tiles\.openfreemap\.org|tiles\.maps\.eox\.at)/, (route) => route.abort());
      await context.route(/(photon\.komoot\.io|nominatim\.openstreetmap\.org)/, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: route.request().url().includes("/reverse") && route.request().url().includes("nominatim") ? "{}" : '{"type":"FeatureCollection","features":[]}' }),
      );
      await use();
    },
    { auto: true },
  ],
});
export { expect };

export interface MapHandle {
  getZoom(): number;
  jumpTo(o: { center?: [number, number]; zoom?: number }): void;
  project(l: [number, number]): { x: number; y: number };
  loaded(): boolean;
}

/** Open the map and wait until the spots are drawn (a marker or a cluster is in the DOM). */
export async function openMap(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => Boolean((window as unknown as { __mapaPapinMap?: unknown }).__mapaPapinMap));
  await expect(page.locator(".mp-marker, .mp-cluster").first()).toBeVisible({ timeout: 30_000 });
}

/** Move the camera with no animation and wait for the markers to settle. */
export async function jumpTo(page: Page, center: [number, number], zoom: number): Promise<void> {
  await page.evaluate(
    ([c, z]) => {
      const map = (window as unknown as { __mapaPapinMap: MapHandle }).__mapaPapinMap;
      map.jumpTo({ center: c as [number, number], zoom: z as number });
    },
    [center, zoom] as const,
  );
  await page.waitForFunction((z) => Math.abs((window as unknown as { __mapaPapinMap: MapHandle }).__mapaPapinMap.getZoom() - (z as number)) < 0.01, zoom);
}

/** Mock Photon (the place search) with fixed answers; anything else goes to the same stub as "no results". */
export async function mockPhoton(context: BrowserContext, answers: Record<string, { name: string; lat: number; lng: number; city?: string; country?: string; countrycode?: string }[]>): Promise<{ calls: string[] }> {
  const calls: string[] = [];
  await context.route(/photon\.komoot\.io\/api/, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    const q = new URL(route.request().url()).searchParams.get("q") ?? "";
    calls.push(q);
    const hits = Object.entries(answers).find(([key]) => q.toLowerCase().includes(key.toLowerCase()))?.[1] ?? [];
    await route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        type: "FeatureCollection",
        features: hits.map((h) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [h.lng, h.lat] },
          properties: { name: h.name, city: h.city ?? h.name, country: h.country ?? "Uruguay", countrycode: h.countrycode ?? "UY", osm_id: 1, osm_type: "N" },
        })),
      }),
    });
  });
  return { calls };
}

/** Count `navigator.geolocation` calls made by the page (getCurrentPosition / watchPosition). Install before navigating. */
export async function spyGeolocation(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    const geo = navigator.geolocation;
    for (const name of ["getCurrentPosition", "watchPosition"] as const) {
      const original = geo[name].bind(geo) as (...a: unknown[]) => unknown;
      (geo as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        w.__geoCalls += 1;
        return original(...args);
      };
    }
  });
}

export const geoCalls = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __geoCalls?: number }).__geoCalls ?? 0);

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The sticker types by label, as the add form prints them. */
export const TYPE = { papa: "Papa", punto: "Sexo.", pregunta: "Sexo?", otro: "Otro" } as const;

/** Toggle a type tile of card 3 ("¿Qué sticker?"). */
export async function pickType(page: Page | Locator, label: string): Promise<void> {
  const tile = page.getByRole("group", { name: "Tipo de sticker" }).getByRole("button", { name: label, exact: true });
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
}

/** Press "Mandale Mecha", wait for the thank-you page and return the id of the new spot. */
export async function submitSpot(page: Page): Promise<string> {
  const send = page.getByRole("button", { name: "Mandale Mecha" });
  await expect(send).not.toHaveAttribute("aria-disabled", "true");
  await send.click();
  await page.waitForURL(/\/gracias\/[0-9A-Z]+$/, { timeout: 30_000 });
  return new URL(page.url()).pathname.split("/").pop()!;
}

/** Type a name into a people combobox and confirm it with Enter. */
export async function addName(page: Page | Locator, comboboxName: string, name: string): Promise<void> {
  const box = page.getByRole("combobox", { name: comboboxName, exact: true });
  await box.fill(name);
  await box.press("Enter");
}

/** A one-finger drag with real touch events (CDP): a mobile-emulated page does not turn `page.mouse` into marker drags. */
export async function touchDrag(page: Page, from: { x: number; y: number }, by: { dx: number; dy: number }, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= steps; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (by.dx * i) / steps, y: from.y + (by.dy * i) / steps }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** The bounding box of an element once it has stopped moving (maps ease to their target for ~600 ms). */
export async function settledBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  let previous = "";
  await expect
    .poll(async () => {
      const now = JSON.stringify(await locator.boundingBox());
      const same = now === previous;
      previous = now;
      return same;
    })
    .toBe(true);
  return JSON.parse(previous) as { x: number; y: number; width: number; height: number };
}

/** Place the pin by pasting coordinates ("Pegar link o coordenadas"). */
export async function pasteCoords(page: Page, text: string): Promise<void> {
  const open = page.getByRole("button", { name: "Pegar link o coordenadas" });
  if ((await open.getAttribute("aria-expanded")) !== "true") await open.click();
  const input = page.getByLabel("Pegar link o coordenadas", { exact: true });
  await input.fill(text);
  await input.blur();
  await expect(page.getByText("Link pegado", { exact: true })).toBeVisible();
}

export const sha256File = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Rows of `spots` whose original photo is one of these files (the bulk add and the single add both store the original's SHA-256). */
export function spotsOfFiles(paths: string[]): SpotRow[] {
  if (paths.length === 0) return [];
  return spotRows(`photo_sha256 IN (${paths.map((p) => `'${sha256File(p)}'`).join(",")})`);
}

/** The EXIF fixtures are generated from a formula: where `gps-NN.jpg` (NN = 1..44) was taken and when. */
export function bulkFixtureGps(n: number): { lat: number; lng: number; takenAt: string } {
  const i = n - 1;
  return {
    lat: -34.9 + (i % 11) * 0.011,
    lng: i < 22 ? -56.17 + (i % 11) * 0.013 : -58.4 + (i % 11) * 0.013,
    takenAt: `2025-04-15T10:${String(i).padStart(2, "0")}:00`,
  };
}
export const gpsFile = (n: number): string => join(BULK_DIR, `gps-${String(n).padStart(2, "0")}.jpg`);

/** How many photos of the bulk draft in IndexedDB are recorded as uploaded (what a reload would resume from). */
export function bulkDraftDone(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("mapapapin-bulk");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction("photos").objectStore("photos").getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve((all.result as { upload: { state: string } }[]).filter((p) => p.upload.state === "done").length);
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

/** `extra-NN.jpg` (NN = 1..20): GPS photos that no other spec uses, for specs that send their own small batches. */
export const extraFile = (n: number): string => join(FIXTURES, "extra", `extra-${String(n).padStart(2, "0")}.jpg`);
