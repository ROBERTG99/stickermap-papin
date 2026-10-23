import { useMemo, useState } from "preact/hooks";
import { Lightbox, type LightboxItem } from "../../components/Lightbox";
import { formatSpotDate } from "../../components/map-parts";
import { storage } from "../../lib/local";
import { t } from "../../lib/i18n";
import { typeBySlug } from "../../lib/store";
import { nearestSpots } from "../../map/filters";
import { LIGHTBOX_NEARBY, resolveTypes } from "../../map/spot-view";
import type { SpotFeature } from "../../shared/types";
import { shareSpot } from "./actions";

interface Props {
  startId: string;
  /** Spots to walk through (the filtered ones); the start spot is added when the filters hide it. */
  features: readonly SpotFeature[];
  all: ReadonlyMap<string, SpotFeature>;
  /** Closed on the spot it ended on, so the map can follow. */
  onClose: (lastId: string) => void;
}

function toItem(f: SpotFeature): LightboxItem {
  const p = f.properties;
  const bySlug = typeBySlug.value;
  return {
    id: f.id,
    photo: p.photo,
    place: p.place_name ?? t("map.spot.unnamed"),
    countryCode: p.country_code,
    placers: p.placer_status === "unknown" ? [] : p.placers,
    date: formatSpotDate(p.taken_at ?? p.created_at),
    types: resolveTypes(p.types, bySlug),
  };
}

/** Full-screen photos of the spot and its neighbours (nearest first). Only spots that have a photo. */
export function PhotoViewer({ startId, features, all, onClose }: Props) {
  const items = useMemo(() => {
    const start = all.get(startId);
    if (!start) return [];
    const [lng, lat] = start.geometry.coordinates;
    const withPhoto = features.filter((f) => f.properties.photo);
    const near = nearestSpots({ id: startId, lng, lat }, withPhoto, LIGHTBOX_NEARBY - 1);
    return [start, ...near].filter((f) => f.properties.photo).map(toItem);
    // `typeBySlug` and the language are read inside toItem; the list only needs to be rebuilt when the spots change.
  }, [startId, features, all]);
  const [index, setIndex] = useState(0);
  if (items.length === 0) return null;
  const current = items[Math.min(index, items.length - 1)];
  return (
    <div class="map-lightbox">
      <Lightbox
        items={items}
        index={index}
        onPrev={() => setIndex((i) => Math.max(0, i - 1))}
        onNext={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
        onClose={() => onClose(current?.id ?? startId)}
        onShare={(item) => void shareSpot(item.id, item.place)}
        showHint={!storage.get("lightboxZoomed", false)}
        onFirstZoom={() => storage.set("lightboxZoomed", true)}
      />
    </div>
  );
}
