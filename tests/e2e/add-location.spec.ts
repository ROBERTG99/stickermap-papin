import { join } from "node:path";
import { apiSpot, expect, FIXTURES, geoCalls, mockPhoton, pickType, resetRateLimits, settledBox, spyGeolocation, submitSpot, test, touchDrag, TYPE } from "./helpers";

const GPS_PHOTO = join(FIXTURES, "gps-montevideo.jpg");
const MONTEVIDEO = { latitude: -34.9061, longitude: -56.1993 };
const DEVICE = { latitude: -34.8836, longitude: -56.1819 };

const galleryInput = (page: import("@playwright/test").Page) => page.locator('input[type="file"][multiple]');
const cameraInput = (page: import("@playwright/test").Page) => page.locator('input[type="file"][capture]');

test.describe("add a sticker: where it is", () => {
  test.beforeEach(() => resetRateLimits());

  test("(a) a JPEG with GPS EXIF places the pin at the photo's coordinates", async ({ page, request }) => {
    await page.goto("/nuevo");
    await galleryInput(page).setInputFiles(GPS_PHOTO);
    await expect(page.getByText("Ubicación de la foto", { exact: true })).toBeVisible();
    await pickType(page, TYPE.papa);
    const id = await submitSpot(page);

    const spot = await apiSpot(request, id);
    expect(spot.location_source).toBe("exif");
    expect(spot.lat).toBeCloseTo(MONTEVIDEO.latitude, 4);
    expect(spot.lng).toBeCloseTo(MONTEVIDEO.longitude, 4);
    expect(spot.taken_at).toMatch(/^2025-04-15T10:42/);
    expect(spot.types).toEqual(["papa"]);
    expect(spot.photo).not.toBeNull();
  });

  test.describe("with a device location", () => {
    test.use({ geolocation: { ...DEVICE, accuracy: 12 }, permissions: ["geolocation"] });

    test("(b) a camera photo without GPS asks the device and stores 'device'", async ({ page, request }) => {
      await page.goto("/nuevo");
      await cameraInput(page).setInputFiles(join(FIXTURES, "nogps-1.jpg"));
      await expect(page.getByText("Tu ubicación (±12 m)")).toBeVisible();
      await pickType(page, TYPE.punto);
      const id = await submitSpot(page);

      const spot = await apiSpot(request, id);
      expect(spot.location_source).toBe("device");
      expect(spot.lat).toBeCloseTo(DEVICE.latitude, 4);
      expect(spot.lng).toBeCloseTo(DEVICE.longitude, 4);
      expect(spot.location_accuracy_m).toBe(12);
    });

    test("(c) a gallery photo without GPS never asks the device; searching 'Montevideo' stores 'search'", async ({ page, context, request }) => {
      await spyGeolocation(context);
      const photon = await mockPhoton(context, { montevideo: [{ name: "Montevideo", lat: -34.9058, lng: -56.1913 }] });
      await page.goto("/nuevo");
      await galleryInput(page).setInputFiles(join(FIXTURES, "nogps-2.jpg"));
      // the photo is read (rotate / remove tools appear) and no position was requested
      await expect(page.getByRole("button", { name: "Quitar" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "¿Dónde está el sticker?" })).toBeVisible();
      expect(await geoCalls(page)).toBe(0);
      await expect(page.getByRole("button", { name: "Mandale Mecha" })).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByText("Falta: ubicación y tipo de sticker")).toBeVisible();

      await page.getByRole("combobox", { name: "Buscar lugar" }).fill("Montevideo");
      await page.getByRole("option", { name: /Montevideo/ }).click();
      expect(photon.calls).toContain("Montevideo");
      await expect(page.getByText("Búsqueda", { exact: true })).toBeVisible();
      expect(await geoCalls(page)).toBe(0);
      await pickType(page, TYPE.pregunta);
      const id = await submitSpot(page);

      const spot = await apiSpot(request, id);
      expect(spot.location_source).toBe("search");
      expect(spot.lat).toBeCloseTo(-34.9058, 4);
      expect(spot.lng).toBeCloseTo(-56.1913, 4);
    });
  });

  test("(d) pasting a Google Maps link stores 'paste'", async ({ page, request }) => {
    await page.goto("/nuevo");
    await page.getByRole("button", { name: "Pegar link o coordenadas" }).click();
    const input = page.getByLabel("Pegar link o coordenadas", { exact: true });
    await input.fill("https://www.google.com/maps/@-34.9011,-56.1645,15z");
    await input.blur();
    await expect(page.getByText("Link pegado", { exact: true })).toBeVisible();
    await expect(page.getByText("-34.9011, -56.1645")).toBeVisible();
    await pickType(page, TYPE.otro);
    await page.getByLabel("¿Cuál?").fill("el de la vaca");
    const id = await submitSpot(page);

    const spot = await apiSpot(request, id);
    expect(spot.location_source).toBe("paste");
    expect(spot.lat).toBeCloseTo(-34.9011, 4);
    expect(spot.lng).toBeCloseTo(-56.1645, 4);
    expect(spot.photo).toBeNull();
    expect(spot.other_text).toBe("el de la vaca");
  });

  test.describe("with a 180 m device fix", () => {
    test.use({ geolocation: { ...DEVICE, accuracy: 180 }, permissions: ["geolocation"] });

    test("(e) low accuracy warns, dragging the pin stores 'pin', and two types make one spot with two chips", async ({ page, request }) => {
      await page.goto("/nuevo");
      await cameraInput(page).setInputFiles(join(FIXTURES, "nogps-3.jpg"));
      const badge = page.locator(".mp-src", { hasText: "Tu ubicación (±180 m)" });
      await expect(badge).toBeVisible();
      await expect(badge).toHaveClass(/mp-src--warn/);
      await expect(page.getByText("Arrastrá el pin justo arriba del sticker.")).toBeVisible();

      // drag the pin 70 px with a finger: the source becomes "Ajustada a mano"
      const pin = page.locator(".add-pin");
      await pin.scrollIntoViewIfNeeded();
      const box = await settledBox(pin);
      await touchDrag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { dx: 70, dy: 40 });
      await expect(page.getByText("Ajustada a mano", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Volver a tu ubicación" })).toBeVisible();

      await pickType(page, TYPE.papa);
      await pickType(page, TYPE.punto);
      const id = await submitSpot(page);

      const spot = await apiSpot(request, id);
      expect(spot.location_source).toBe("pin");
      expect(spot.location_accuracy_m).toBeNull();
      expect(spot.lat).not.toBeCloseTo(DEVICE.latitude, 4);
      expect(spot.types.sort()).toEqual(["papa", "sexo-punto"]);

      // the marker sheet shows both chips for that single spot
      await page.goto(`/s/${id}`);
      await page.getByRole("button", { name: "Expandir" }).click();
      const full = page.getByRole("dialog");
      await expect(full.locator(".mp-spot__types .mp-tag")).toHaveCount(2);
    });
  });
});
