import type { SpotDetail, SpotFeature, StickerType } from "../shared/types";

/** Pure helpers between the API shapes and what the map surfaces need. */

export const FALLBACK_ICON = "/img/icons/papa.png";

/** The spot's types resolved against the active list, lowest `sort_order` first (the marker head is the first one). */
export function resolveTypes(slugs: readonly string[], bySlug: ReadonlyMap<string, StickerType>): StickerType[] {
  return slugs
    .map((s) => bySlug.get(s))
    .filter((t): t is StickerType => t !== undefined)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export interface MarkerSpec {
  iconUrl: string;
  fit: StickerType["fit"];
  /** Labels of every type, head first (accessible name). */
  labels: string[];
}

export function markerSpec(f: SpotFeature, bySlug: ReadonlyMap<string, StickerType>): MarkerSpec {
  const types = resolveTypes(f.properties.types, bySlug);
  const head = types[0];
  return { iconUrl: head?.icon ?? FALLBACK_ICON, fit: head?.fit ?? "contain", labels: types.map((t) => t.label) };
}

/** What `/api/spots` already says about a spot, shaped as a `SpotDetail` so the sheet can open before `/api/spots/:id` answers. */
export function featureToDetail(f: SpotFeature): SpotDetail {
  const [lng, lat] = f.geometry.coordinates;
  return {
    ...f.properties,
    lat,
    lng,
    location_source: "legacy",
    location_accuracy_m: null,
    is_approximate: false,
    city: null,
    note: null,
    other_text: null,
    placer_note: null,
    photo_w: null,
    photo_h: null,
  };
}

/** Public link of a spot (what "Compartir" shares). */
export const spotUrl = (id: string, origin: string): string => `${origin}/s/${id}`;

/** Max photos in the lightbox strip: the current spot and the closest ones. */
export const LIGHTBOX_NEARBY = 24;
