import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Page, Route } from "@playwright/test";
import {
  BULK_DIR, apiSpots, bulkDraftDone, bulkFixtureGps, expect, geoCalls, extraFile, gpsFile, mockPhoton, pickType, query, resetRateLimits, sha256File, spotRows, spotsOfFiles, spyGeolocation, test, TYPE,
  submitSpot,
} from "./helpers";

const allFiles = () => readdirSync(BULK_DIR).sort().map((f) => join(BULK_DIR, f));
const extraRange = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => extraFile(from + i));

/** Pick files on /nuevo/varias and wait for the review. */
async function review(page: Page, files: string[], heading: RegExp = /^Revisar \d+ fotos?$/): Promise<void> {
  await page.goto("/nuevo/varias");
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 90_000 });
}

const sendButton = (page: Page, n: number) => page.getByRole("button", { name: `Mandale Mecha (${n})` });

test.describe("bulk add", () => {
  test.beforeEach(() => resetRateLimits());

  test("50 photos: review summary, 44 spots at their EXIF coordinates, no device location, then one placed by hand", async ({ page, context, request }) => {
    test.setTimeout(240_000);
    await spyGeolocation(context);
    const photon = await mockPhoton(context, { montevideo: [{ name: "Montevideo", lat: -34.9058, lng: -56.1913 }] });

    // "already on the map": the legacy photo goes in through the normal add flow first
    await page.goto("/nuevo");
    await page.locator('input[type="file"][multiple]').setInputFiles(join(BULK_DIR, "already-on-map.jpeg"));
    await expect(page.getByText("Ubicación de la foto", { exact: true })).toBeVisible();
    await pickType(page, TYPE.punto);
    const existingId = await submitSpot(page);

    await review(page, allFiles(), /^Revisar 50 fotos$/);
    // chips: 44 ready, 3 without a location, 3 left out (already there, repeated, unreadable)
    const chip = (name: string) => page.getByRole("group", { name: "Filtrar fotos" }).getByRole("button", { name: new RegExp(`^${name}\\s*\\d+$`) });
    await expect(chip("Todas")).toContainText("50");
    await expect(chip("Listas")).toContainText("44");
    await expect(chip("Sin ubicación")).toContainText("3");
    await expect(chip("Omitidas")).toContainText("3");
    // every row says what it is
    const rows = page.locator("li.mp-bitem");
    await expect(rows).toHaveCount(50);
    await expect(rows.filter({ hasText: "Ya está en el mapa" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Repetida en este lote" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "No se pudo leer" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Sin ubicación" })).toHaveCount(3);
    await expect(rows.filter({ hasText: "Ubicación de la foto" })).toHaveCount(44);
    // "Ver" links to the spot that already holds the photo
    await rows.filter({ hasText: "Ya está en el mapa" }).getByRole("button", { name: /^Ver foto \d+ en el mapa$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${existingId}$`));
    await page.goBack();
    await expect(page.getByRole("heading", { name: /^Revisar 50 fotos$/ })).toBeVisible();

    // nothing is sent without a type; with one the button counts the 44
    await expect(page.getByRole("button", { name: /^Mandale Mecha \(44\)$/ })).toBeDisabled();
    await pickType(page, TYPE.papa);
    await expect(sendButton(page, 44)).toBeEnabled();
    await sendButton(page, 44).click();
    await expect(page.getByRole("heading", { name: "¡Mandaste mecha!" })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByRole("status").filter({ hasText: "stickers nuevos" })).toContainText("44");
    await expect(page.getByText("3 fotos sin ubicación", { exact: true })).toBeVisible();

    // exactly 44 spots, at the EXIF coordinates and times, from one batch
    const gps = Array.from({ length: 44 }, (_, i) => gpsFile(i + 1));
    const created = spotsOfFiles(gps);
    expect(created).toHaveLength(44);
    expect(new Set(created.map((r) => r.batch_id)).size).toBe(1);
    for (const [i, file] of gps.entries()) {
      const row = created.find((r) => r.photo_sha256 === sha256File(file))!;
      const want = bulkFixtureGps(i + 1);
      expect(row.location_source, file).toBe("exif");
      expect(row.lat).toBeCloseTo(want.lat, 3);
      expect(row.lng).toBeCloseTo(want.lng, 3);
      expect(row.taken_at, file).toMatch(new RegExp(`^${want.takenAt.slice(0, 16)}`));
      expect(row.status).toBe("published");
    }
    // the 3 without GPS, the repeat and the broken file were not created; the device location was never asked
    const noGps = [1, 2, 3].map((n) => join(BULK_DIR, `nogps-${n}.jpg`));
    expect(spotsOfFiles(noGps)).toHaveLength(0);
    expect(spotsOfFiles([join(BULK_DIR, "repeat-of-gps-01.jpg")])).toHaveLength(1); // same bytes as gps-01: one spot, not two
    expect(spotRows(`batch_id = '${created[0]!.batch_id}'`)).toHaveLength(44);
    expect(await geoCalls(page)).toBe(0);

    // place one of the three by hand (search), send again: exactly one more spot, source "search"
    await page.getByRole("button", { name: "Ubicarlas ahora" }).click();
    // the review keeps the six photos that were not sent (3 without a location, 3 left out); only the first filter is shown
    await expect(page.getByRole("heading", { name: /^Revisar 6 fotos$/ })).toBeVisible();
    await expect(page.locator("li.mp-bitem")).toHaveCount(3);
    await page.locator("li.mp-bitem").first().getByRole("button", { name: "Ubicar", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Foto del lote" });
    await expect(sheet.getByRole("heading", { name: "¿Dónde está este sticker?" })).toBeVisible();
    await sheet.getByRole("combobox", { name: "Buscar lugar" }).fill("Montevideo");
    await sheet.getByRole("option", { name: /Montevideo/ }).click();
    expect(photon.calls.some((q) => /montevideo/i.test(q))).toBe(true);
    await sheet.getByRole("button", { name: "Confirmar ubicación" }).click();
    await expect(sheet).toBeHidden();
    await expect(sendButton(page, 1)).toBeEnabled();
    await sendButton(page, 1).click();
    await expect(page.getByRole("status").filter({ hasText: "sticker nuevo" })).toContainText("1", { timeout: 60_000 });

    const placed = spotsOfFiles(noGps);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ location_source: "search", status: "published" });
    expect(placed[0]!.lat).toBeCloseTo(-34.9058, 4);
    expect(await geoCalls(page)).toBe(0);
    expect(spotsOfFiles(noGps.filter((f) => sha256File(f) !== placed[0]!.photo_sha256))).toHaveLength(0);
    const features = await apiSpots(request);
    expect(features.some((f) => f.id === placed[0]!.id)).toBe(true);
  });

  test("a dropped connection mid-upload ends with no duplicate spots after 'Reintentar fallidas'", async ({ page, request }) => {
    test.setTimeout(180_000);
    const files = extraRange(1, 6);
    let online = true;
    const posts: string[] = [];
    let lostResponse = false;
    await page.route("**/api/spots", async (route: Route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posts.push("post");
      if (online && posts.length <= 2) return route.continue();
      if (online && !lostResponse) {
        // the server stores this one, the answer never arrives: the retry must not create a second spot
        lostResponse = true;
        await route.fetch();
        return route.abort("connectionreset");
      }
      if (online && posts.length <= 6) return route.continue();
      return route.abort("internetdisconnected");
    });

    await review(page, files, /^Revisar 6 fotos$/);
    await pickType(page, TYPE.papa);
    await sendButton(page, 6).click();
    // go offline once the first ones are in: the rest fail after their automatic retries
    await expect.poll(() => posts.length).toBeGreaterThanOrEqual(3);
    online = false;
    const retry = page.getByRole("button", { name: /^Reintentar fallidas \(\d+\)$/ });
    await expect(retry).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Se cortó la conexión. Tu sticker sigue acá.")).toBeVisible();
    const before = spotsOfFiles(files).length;
    expect(before).toBeLessThan(6);

    online = true;
    posts.length = 0;
    await retry.click();
    await expect(page.getByRole("heading", { name: "¡Mandaste mecha!" })).toBeVisible({ timeout: 60_000 });
    const rows = spotsOfFiles(files);
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.id)).size).toBe(6);
    expect(new Set(rows.map((r) => r.photo_sha256)).size).toBe(6);
    expect(query<{ n: number }>(`SELECT COUNT(*) AS n FROM spots WHERE batch_id = '${rows[0]!.batch_id}'`)[0]!.n).toBe(6);
    expect(lostResponse).toBe(true);
  });

  test("reloading mid-upload resumes from the IndexedDB draft", async ({ page }) => {
    test.setTimeout(180_000);
    const files = extraRange(7, 12);
    let allowed = 2;
    await page.route("**/api/spots", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      if (allowed-- > 0) return route.continue();
      return route.abort("internetdisconnected");
    });
    await review(page, files, /^Revisar 6 fotos$/);
    await pickType(page, TYPE.papa);
    await sendButton(page, 6).click();
    // the two uploads are on the server and recorded in the draft before the page goes away
    await expect.poll(() => bulkDraftDone(page), { timeout: 60_000 }).toBe(2);
    expect(spotsOfFiles(files)).toHaveLength(2);

    await page.unroute("**/api/spots");
    await page.reload();
    await expect(page.getByText("Tenés un lote sin terminar: 2 de 6 subidas")).toBeVisible();
    await page.getByRole("button", { name: "Seguir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "¡Mandaste mecha!" })).toBeVisible({ timeout: 90_000 });
    const rows = spotsOfFiles(files);
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.batch_id)).size).toBe(1);
  });

  test("'Borrar este lote' hides every spot of the batch", async ({ page, request }) => {
    const files = extraRange(13, 15);
    await review(page, files, /^Revisar 3 fotos$/);
    await pickType(page, TYPE.papa);
    await sendButton(page, 3).click();
    await expect(page.getByRole("heading", { name: "¡Mandaste mecha!" })).toBeVisible({ timeout: 60_000 });
    const ids = spotsOfFiles(files).map((r) => r.id);
    expect(ids).toHaveLength(3);
    expect((await apiSpots(request)).filter((f) => ids.includes(f.id))).toHaveLength(3);

    await page.getByRole("button", { name: "Borrar este lote" }).click();
    const confirm = page.getByRole("alertdialog", { name: "¿Borrar este lote?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Borrar este lote" }).click();
    await expect(page.getByText("Listo, borramos el lote.")).toBeVisible();

    expect(spotsOfFiles(files).map((r) => r.status)).toEqual(["hidden", "hidden", "hidden"]);
    expect((await apiSpots(request)).filter((f) => ids.includes(f.id))).toHaveLength(0);
    for (const id of ids) expect((await request.get(`/api/spots/${id}`)).status()).toBe(404);
  });
});
