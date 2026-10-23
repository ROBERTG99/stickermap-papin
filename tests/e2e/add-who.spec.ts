import { join } from "node:path";
import { addName, apiSpot, apiSpots, expect, FIXTURES, jumpTo, openMap, pasteCoords, pickType, resetRateLimits, submitSpot, test, TYPE } from "./helpers";

const send = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Mandale Mecha" });
const who = (page: import("@playwright/test").Page, label: "Yo" | "Otro/s" | "No sé") => page.getByRole("radio", { name: label, exact: true });

test.describe("add a sticker: who stuck it", () => {
  test.beforeEach(() => resetRateLimits());

  test("(f) 'Soy: Ana' + 'Yo' makes Ana the placer", async ({ page, request }) => {
    await page.goto("/nuevo");
    await pasteCoords(page, "-34.9020, -56.1630");
    await pickType(page, TYPE.papa);
    await addName(page, "Soy:", "Ana");
    // "Yo" is the default once "Soy:" is filled; tapping it keeps it
    await expect(who(page, "Yo")).toHaveAttribute("aria-checked", "true");
    await who(page, "Yo").click();
    await expect(page.locator(".mp-spot__by-names")).toHaveText("Ana (vos)");
    const spot = await apiSpot(request, await submitSpot(page));
    expect(spot).toMatchObject({ placer_status: "self", placers: ["Ana"], reporter: "Ana" });
  });

  test("(g) 'Otro/s' with Beto and Caro stores two placers; the sheet lists both and the Caro filter includes the spot", async ({ page, request }) => {
    await page.goto("/nuevo");
    await pasteCoords(page, "-34.9040, -56.1650");
    await pickType(page, TYPE.punto);
    await who(page, "Otro/s").click();
    await addName(page, "Agregar nombre", "Beto");
    await addName(page, "Agregar nombre", "Caro");
    await expect(page.getByRole("button", { name: /Quitar Beto/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Quitar Caro/ })).toBeVisible();
    const id = await submitSpot(page);

    const spot = await apiSpot(request, id);
    expect(spot.placer_status).toBe("other");
    expect(spot.placers).toEqual(["Beto", "Caro"]);
    expect(spot.reporter).toBeNull();

    // the sheet shows both names
    await openMap(page, `/s/${id}`);
    await page.getByRole("button", { name: "Expandir" }).click();
    const names = page.getByRole("dialog").locator(".mp-spot__by-names");
    await expect(names).toContainText("Beto");
    await expect(names).toContainText("Caro");

    // "Pegado por" filter on Caro keeps this spot on the map
    await openMap(page);
    const features = await apiSpots(request);
    const caro = features.filter((f) => f.properties.placer_status !== "unknown" && f.properties.placers.includes("Caro"));
    expect(caro.map((f) => f.id)).toContain(id);
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    const filters = page.getByRole("dialog", { name: "Filtros" });
    await filters.locator(".mp-field").filter({ has: page.getByText("Pegado por", { exact: true }) }).getByRole("button", { name: /Caro\s*\d+\s*$/ }).click();
    await expect(filters.getByRole("button", { name: caro.length === 1 ? "Ver 1 sticker" : `Ver ${caro.length} stickers` })).toBeVisible();
    await filters.getByRole("button", { name: /^Ver / }).click();
    await jumpTo(page, [spot.lng, spot.lat], 15);
    await expect(page.locator(`.mp-marker[data-spot-id="${id}"]`)).toBeVisible();
  });

  test("(h) an empty 'Soy' defaults to 'No sé' and the submit works", async ({ page, request }) => {
    await page.goto("/nuevo");
    await pasteCoords(page, "-34.9060, -56.1670");
    await pickType(page, TYPE.pregunta);
    await expect(who(page, "No sé")).toHaveAttribute("aria-checked", "true");
    // "Yo" without a name sends the user to the "Soy:" field instead of failing
    await who(page, "Yo").click();
    await expect(page.getByRole("combobox", { name: "Soy:" })).toBeFocused();
    await expect(who(page, "No sé")).toHaveAttribute("aria-checked", "true");
    const spot = await apiSpot(request, await submitSpot(page));
    expect(spot).toMatchObject({ placer_status: "unknown", placers: [], reporter: null });
  });

  test("(i) 'Otro/s' without names blocks the submit", async ({ page, request }) => {
    const before = (await apiSpots(request)).length;
    await page.goto("/nuevo");
    await pasteCoords(page, "-34.9080, -56.1690");
    await pickType(page, TYPE.papa);
    await who(page, "Otro/s").click();
    await expect(send(page)).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Falta: quién lo pegó")).toBeVisible();
    await send(page).click({ force: true }); // aria-disabled, not disabled: the tap is how the form points at what is missing
    await expect(page.getByText("Poné al menos un nombre, o elegí “No sé”.")).toBeVisible();
    await expect(page).toHaveURL(/\/nuevo$/);
    expect((await apiSpots(request)).length).toBe(before);

    // naming someone unblocks it
    await addName(page, "Agregar nombre", "Nacho");
    await expect(send(page)).not.toHaveAttribute("aria-disabled", "true");
  });

  test("a photo that is already on the map offers 'Agregar sticker a ese lugar' and adds the type there", async ({ page, request }) => {
    const photo = join(FIXTURES, "nogps-4.jpg");
    await page.goto("/nuevo");
    await page.locator('input[type="file"][multiple]').setInputFiles(photo);
    await pasteCoords(page, "-34.9100, -56.1710");
    await pickType(page, TYPE.papa);
    await addName(page, "Soy:", "Ana");
    const id = await submitSpot(page);

    await page.goto("/nuevo");
    await page.locator('input[type="file"][multiple]').setInputFiles(photo);
    const ask = page.getByRole("dialog", { name: "Esta foto ya está en el mapa" });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: "Agregar sticker a ese lugar" }).click();
    const add = page.getByRole("dialog", { name: "Agregar sticker a ese lugar" });
    await pickType(add, TYPE.punto);
    await add.getByRole("radio", { name: "Otro/s" }).click();
    await addName(add, "Agregar nombre", "Nacho");
    await add.getByRole("button", { name: "Agregar sticker", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/s/${id}$`));
    const spot = await apiSpot(request, id);
    expect(spot.types.sort()).toEqual(["papa", "sexo-punto"]);
    expect(spot.placers).toEqual(expect.arrayContaining(["Ana", "Nacho"]));
  });
});
