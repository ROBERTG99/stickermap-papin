import type { Page } from "@playwright/test";
import type { SpotFeature } from "../../src/shared/types";
import { apiSpots, expect, jumpTo, openMap, test, type MapHandle } from "./helpers";

/** BUILD.md 7.2: "the dot is the truth". From z6 every spot is its own marker whose 8px dot sits on the coordinate; clusters stop at z5. */

interface DotReport {
  inView: string[];
  missing: string[];
  worstPx: number;
  clusters: number;
  strayMarkers: number;
}

/** For every spot that projects inside the canvas: is there a marker, and how far is its dot from `map.project(lngLat)`? */
async function dotReport(page: Page, features: SpotFeature[]): Promise<DotReport> {
  return page.evaluate((spots) => {
    const map = (window as unknown as { __mapaPapinMap: MapHandle }).__mapaPapinMap;
    const canvas = document.querySelector(".maplibregl-canvas")!.getBoundingClientRect();
    const report: DotReport = { inView: [], missing: [], worstPx: 0, clusters: document.querySelectorAll(".mp-cluster").length, strayMarkers: 0 };
    const ids = new Set(spots.map((s) => s.id));
    for (const marker of document.querySelectorAll<HTMLElement>(".mp-marker[data-spot-id]")) if (!ids.has(marker.dataset.spotId ?? "")) report.strayMarkers += 1;
    for (const spot of spots) {
      const p = map.project(spot.geometry.coordinates);
      if (p.x < 8 || p.y < 8 || p.x > canvas.width - 8 || p.y > canvas.height - 8) continue;
      report.inView.push(spot.id);
      const dot = document.querySelector(`.mp-marker[data-spot-id="${spot.id}"] .mp-marker__dot`);
      if (!dot) {
        report.missing.push(spot.id);
        continue;
      }
      const r = dot.getBoundingClientRect();
      const dx = r.left + r.width / 2 - (canvas.left + p.x);
      const dy = r.top + r.height / 2 - (canvas.top + p.y);
      report.worstPx = Math.max(report.worstPx, Math.hypot(dx, dy));
    }
    return report;
  }, features);
}

test.describe("marker dots", () => {
  test("from z6 every spot is its own marker and its dot sits on the coordinate; clusters stop at z5", async ({ page, request }) => {
    const features = await apiSpots(request);
    const montevideo = features.filter((f) => f.properties.country_code === "uy");
    expect(montevideo.length).toBeGreaterThanOrEqual(2);
    const centre = montevideo[0]!.geometry.coordinates;
    await openMap(page);
    // z5: the two Montevideo spots (about 100 m apart) are still merged into a cluster
    await jumpTo(page, centre, 5);
    await expect.poll(async () => (await dotReport(page, features)).clusters).toBeGreaterThan(0);
    for (const spot of montevideo) await expect(page.locator(`.mp-marker[data-spot-id="${spot.id}"]`)).toHaveCount(0);

    for (const zoom of [6, 6.5, 9, 13, 17, 19]) {
      await jumpTo(page, centre, zoom);
      // no cluster bubble at all, and every spot in view has its marker
      await expect.poll(async () => {
        const r = await dotReport(page, features);
        return { clusters: r.clusters, missing: r.missing.length, inView: r.inView.length > 0 };
      }, { message: `z${zoom}` }).toEqual({ clusters: 0, missing: 0, inView: true });
      await expect(page.locator(".map-marker--enter")).toHaveCount(0);
      const report = await dotReport(page, features);
      expect(report.worstPx, `z${zoom}: dot offset from map.project`).toBeLessThanOrEqual(1);
    }

    // at z17 two spots 100 m apart are two separate dots
    await jumpTo(page, centre, 17);
    const sameUy = await dotReport(page, montevideo);
    expect(sameUy.inView.length).toBeGreaterThanOrEqual(2);
  });
});
