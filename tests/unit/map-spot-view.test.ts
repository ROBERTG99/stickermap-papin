import { describe, expect, it } from "vitest";
import { FALLBACK_ICON, featureToDetail, markerSpec, resolveTypes, spotUrl } from "../../src/map/spot-view";
import type { SpotFeature, StickerType } from "../../src/shared/types";

const type = (slug: string, sort_order: number, over: Partial<StickerType> = {}): StickerType => ({
  slug,
  label: slug.toUpperCase(),
  icon: `/img/icons/${slug}.png`,
  color: "#31872E",
  fit: "cover",
  sort_order,
  allows_text: false,
  ...over,
});
const bySlug = new Map([type("papa", 1, { fit: "contain" }), type("sexo", 2), type("otro", 99)].map((t) => [t.slug, t]));

const feature: SpotFeature = {
  type: "Feature",
  id: "S1",
  geometry: { type: "Point", coordinates: [-3.7076, 40.4149] },
  properties: {
    id: "S1",
    types: ["otro", "sexo", "papa", "gone"],
    placers: ["Beto"],
    placer_status: "other",
    reporter: "Ana",
    place_name: "Madrid",
    country: "España",
    country_code: "es",
    taken_at: null,
    created_at: "2025-04-15T12:00:00.000Z",
    thumb: null,
    photo: "/img/display/S1.webp",
    n: 4,
  },
};

describe("resolveTypes", () => {
  it("orders by sort_order and drops types that are no longer active", () => {
    expect(resolveTypes(feature.properties.types, bySlug).map((t) => t.slug)).toEqual(["papa", "sexo", "otro"]);
  });
});

describe("markerSpec", () => {
  it("uses the lowest sort_order type as the head, with its fit", () => {
    const spec = markerSpec(feature, bySlug);
    expect(spec).toEqual({ iconUrl: "/img/icons/papa.png", fit: "contain", labels: ["PAPA", "SEXO", "OTRO"] });
  });

  it("falls back to the potato when no type is known", () => {
    const spec = markerSpec({ ...feature, properties: { ...feature.properties, types: ["gone"] } }, bySlug);
    expect(spec.iconUrl).toBe(FALLBACK_ICON);
    expect(spec.labels).toEqual([]);
  });
});

describe("featureToDetail", () => {
  it("keeps the exact coordinates (lng first in GeoJSON, lat first in the detail)", () => {
    const d = featureToDetail(feature);
    expect(d.lng).toBe(-3.7076);
    expect(d.lat).toBe(40.4149);
    expect(d.place_name).toBe("Madrid");
    expect(d.note).toBeNull();
  });
});

describe("spotUrl", () => {
  it("builds the public /s/<id> link", () => {
    expect(spotUrl("S1", "https://example.test")).toBe("https://example.test/s/S1");
  });
});
