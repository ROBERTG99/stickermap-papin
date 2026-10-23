import type { Locator, Page } from "@playwright/test";
import type { SpotFeature, StickerType } from "../../src/shared/types";
import { apiSpots, escapeRegExp as esc, expect, haversine, jumpTo, openMap, query, test } from "./helpers";

/** Specs here read the live API for expectations: earlier specs add spots, so nothing hard-codes the seeded count. */

const coords = (f: SpotFeature) => ({ lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
const byPlace = (features: SpotFeature[], place: string) => {
  const found = features.find((f) => f.properties.place_name === place);
  if (!found) throw new Error(`no seeded spot in ${place}`);
  return found;
};

/** Open a spot by tapping its real marker (the dot is the coordinate: zoom in on it first). */
async function tapSpot(page: Page, spot: SpotFeature): Promise<void> {
  const c = coords(spot);
  await jumpTo(page, [c.lng, c.lat], 14);
  await page.locator(`.mp-marker[data-spot-id="${spot.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/s/${spot.id}$`));
}


/** Sum of what the map draws: every cluster bubble counts its number, every lone marker counts 1. */
async function drawnTotal(page: Page): Promise<number> {
  return page.evaluate(() => {
    let total = document.querySelectorAll(".mp-marker[data-spot-id]").length;
    for (const el of document.querySelectorAll(".mp-cluster")) total += Number((el.textContent ?? "0").replace(/\D/g, "")) || 0;
    return total;
  });
}

test.describe("map", () => {
  test("loads with a cluster-count total equal to the spot count", async ({ page, request }) => {
    const features = await apiSpots(request);
    expect(features.length).toBeGreaterThanOrEqual(8);
    await openMap(page);
    // first load frames every spot, so nothing is off screen; markers may still be settling in
    await expect.poll(() => drawnTotal(page), { timeout: 20_000 }).toBe(features.length);
    // the first-visit hint is dismissed by any map tap and the legend starts as a pill on phones
    await expect(page.getByRole("button", { name: "Tipos" })).toHaveAttribute("aria-expanded", "false");
  });

  test("tapping a spot opens the sheet with a thumbnail", async ({ page, request }) => {
    const shanghai = byPlace(await apiSpots(request), "Shanghái");
    await openMap(page);
    await tapSpot(page, shanghai);
    const region = page.getByRole("region", { name: "Sticker seleccionado" });
    await expect(region).toBeVisible();
    await expect(region.getByRole("heading", { name: "Shanghái" })).toBeVisible();
    const thumb = region.locator(".mp-spot__thumb img");
    await expect(thumb).toHaveAttribute("src", `/img/display/${shanghai.id}.webp`);
    await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  });

  test("the photo opens the lightbox and swiping goes to the nearest spot", async ({ page, request }) => {
    const features = await apiSpots(request);
    const start = byPlace(features, "Madrid");
    const nearest = features
      .filter((f) => f.id !== start.id && f.properties.photo)
      .map((f) => ({ f, d: haversine(coords(start), coords(f)) }))
      .sort((a, b) => a.d - b.d)[0]!.f;

    await openMap(page);
    await tapSpot(page, start);
    await page.getByRole("button", { name: "Ver foto", exact: true }).click();
    const box = page.getByRole("dialog", { name: /^Foto de / });
    await expect(box).toBeVisible();
    await expect(box.getByRole("img", { name: /^Foto:/ })).toHaveAttribute("src", `/img/display/${start.id}.webp`);

    // swipe left with the pointer: the stage moves to the next photo, which is the closest spot to Madrid
    const stage = await box.locator(".mp-lightbox__stage").boundingBox();
    expect(stage).not.toBeNull();
    const y = stage!.y + stage!.height / 2;
    await page.mouse.move(stage!.x + stage!.width - 40, y);
    await page.mouse.down();
    await page.mouse.move(stage!.x + 40, y, { steps: 8 });
    await page.mouse.up();
    await expect(box.getByRole("img", { name: /^Foto:/ })).toHaveAttribute("src", `/img/display/${nearest.id}.webp`);
    await expect(box.locator(".mp-lightbox__count")).toHaveText(/^2 \/ \d+$/);

    // closing hands the map over to the spot the lightbox ended on
    await box.getByRole("button", { name: "Cerrar" }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${nearest.id}$`));
  });

  test("an unknown placer shows ¿? and the button opens Reportar with 'Sé quién lo pegó'", async ({ page, request }) => {
    const madrid = byPlace(await apiSpots(request), "Madrid");
    await openMap(page);
    await tapSpot(page, madrid);
    await page.getByRole("button", { name: "Expandir" }).click();
    const full = page.getByRole("dialog", { name: "Madrid" });
    await expect(full).toBeVisible();
    await expect(full.locator(".mp-spot__by-names")).toHaveText("¿?");

    await full.getByRole("button", { name: "¿Sabés quién fue?" }).click();
    const dialog = page.getByRole("dialog", { name: "Sé quién lo pegó" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("¿Quién fue?")).toBeFocused();

    // sending is wired end to end: the spot is flagged for the admin placer queue
    await dialog.getByLabel("¿Quién fue?").fill("Nacho");
    await dialog.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Gracias. Un admin lo va a asignar.")).toBeVisible();
    await expect.poll(() => query<{ review_reason: string; needs_review: number }>(`SELECT review_reason, needs_review FROM spots WHERE id = '${madrid.id}'`)[0]).toMatchObject({ needs_review: 1, review_reason: expect.stringContaining("know_placer") });
  });
});

test.describe("legend and filters", () => {
  async function openLegend(page: Page): Promise<Locator> {
    // the first-visit card sits over the legend until it is dismissed
    await page.getByRole("button", { name: "¡Dale!" }).click();
    const toggle = page.getByRole("button", { name: "Tipos" });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    return page.locator(".mp-legend__list");
  }

  async function typesOf(request: Parameters<typeof apiSpots>[0]): Promise<StickerType[]> {
    return (await (await request.get("/api/types")).json()) as StickerType[];
  }

  test("tapping a legend type filters to it, shows the undo toast and undoes it", async ({ page, request }) => {
    const features = await apiSpots(request);
    const papa = (await typesOf(request)).find((tp) => tp.slug === "papa")!;
    const withPapa = features.filter((f) => f.properties.types.includes("papa"));
    expect(withPapa.length).toBeGreaterThan(0);
    expect(withPapa.length).toBeLessThan(features.length);

    await openMap(page);
    await expect.poll(() => drawnTotal(page), { timeout: 20_000 }).toBe(features.length);
    const list = await openLegend(page);
    await list.getByRole("button", { name: new RegExp(`^${esc(papa.label)}`) }).click();

    const toast = page.getByRole("status").filter({ hasText: `Mostrando solo ${papa.label}` });
    await expect(toast).toBeVisible();
    await expect(toast.getByRole("button", { name: "Deshacer" })).toBeVisible();
    await expect.poll(() => drawnTotal(page), { timeout: 20_000 }).toBe(withPapa.length);
    // the filter button carries the active count
    await expect(page.getByRole("button", { name: "Filtros, 1 activo" })).toBeVisible();

    await toast.getByRole("button", { name: "Deshacer" }).click();
    await expect.poll(() => drawnTotal(page), { timeout: 20_000 }).toBe(features.length);
    await expect(page.getByRole("button", { name: "Filtros", exact: true })).toBeVisible();
  });

  test("chip counts follow the other filters and the button says how many are left", async ({ page, request }) => {
    const features = await apiSpots(request);
    const types = await typesOf(request);
    const has = (f: SpotFeature, slug: string) => f.properties.types.includes(slug);
    const placedBy = (f: SpotFeature, name: string) => f.properties.placer_status !== "unknown" && f.properties.placers.includes(name);

    await openMap(page);
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Filtros" });
    await expect(filters).toBeVisible();
    await expect(filters.getByRole("button", { name: `Ver ${features.length} stickers` })).toBeVisible();

    const papa = types.find((tp) => tp.slug === "papa")!;
    const withPapa = features.filter((f) => has(f, "papa"));
    await filters.getByRole("button", { name: new RegExp(`^${esc(papa.label)}\\s+\\d+$`) }).click();
    await expect(filters.getByRole("button", { name: `Ver ${withPapa.length} stickers` })).toBeVisible();

    // "Pegado por" counts are now computed inside the papa spots only
    const section = filters.locator(".mp-field").filter({ has: page.getByText("Pegado por", { exact: true }) });
    const names = [...new Set(withPapa.flatMap((f) => (f.properties.placer_status === "unknown" ? [] : f.properties.placers)))];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names.slice(0, 3)) {
      const expected = withPapa.filter((f) => placedBy(f, name)).length;
      await expect(section.getByRole("button", { name: new RegExp(`^(?:\\S{1,2}\\s*)?${name}\\s*${expected}\\s*$`) }).first()).toBeVisible();
    }

    // adding a placer narrows the result again
    const caro = withPapa.filter((f) => placedBy(f, names[0]!));
    await section.getByRole("button", { name: new RegExp(`${names[0]}\\s*\\d+\\s*$`) }).first().click();
    await expect(filters.getByRole("button", { name: caro.length === 1 ? "Ver 1 sticker" : `Ver ${caro.length} stickers` })).toBeVisible();

    // applying closes the sheet and the map shows exactly those spots
    await filters.getByRole("button", { name: /^Ver (\d+ stickers|1 sticker)$/ }).click();
    await expect(filters).toBeHidden();
    await expect.poll(() => drawnTotal(page), { timeout: 20_000 }).toBe(caro.length);
  });

  test("a filter combination without stickers shows 'Nadie pegó nada acá… todavía'", async ({ page, request }) => {
    const features = await apiSpots(request);
    const types = await typesOf(request);
    const placed = (f: SpotFeature) => (f.properties.placer_status === "unknown" ? [] : f.properties.placers);
    const names = [...new Set(features.flatMap(placed))];
    // type A (to keep) and B (to drop) + a person P with a B sticker but no A sticker: dropping B leaves nothing
    let pick: { a: StickerType; b: StickerType; person: string } | null = null;
    for (const a of types) for (const b of types) for (const person of names) {
      if (a.slug === b.slug || pick) continue;
      const mine = features.filter((f) => placed(f).includes(person));
      if (mine.some((f) => f.properties.types.includes(b.slug)) && !mine.some((f) => f.properties.types.includes(a.slug))
        && features.some((f) => f.properties.types.includes(a.slug))) pick = { a, b, person };
    }
    expect(pick, "the seed has a type/person pair without overlap").not.toBeNull();
    const { a, b, person } = pick!;

    await openMap(page);
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Filtros" });
    const chip = (label: string | RegExp) => filters.getByRole("button", { name: label });
    await chip(new RegExp(`^${esc(a.label)}\\s+\\d+$`)).click();
    await chip(new RegExp(`^${esc(b.label)}\\s+\\d+$`)).click();
    await filters.locator(".mp-field").filter({ has: page.getByText("Pegado por", { exact: true }) }).getByRole("button", { name: new RegExp(`${esc(person)}\\s*\\d+\\s*$`) }).first().click();
    await chip(new RegExp(`^${esc(b.label)}\\s+\\d+$`)).click(); // drop B: A and P do not share a sticker
    await expect(chip("Sin stickers")).toBeVisible();
    await chip("Sin stickers").click();

    const empty = page.getByText("Nadie pegó nada acá… todavía");
    await expect(empty).toBeVisible();
    await page.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect(empty).toBeHidden();
    await expect.poll(() => drawnTotal(page), { timeout: 20_000 }).toBe(features.length);
  });
});
