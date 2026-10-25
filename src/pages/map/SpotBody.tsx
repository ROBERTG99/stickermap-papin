import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon";
import { SpotContent, toSpotView } from "../../components/SpotContent";
import { SightingSheet } from "../../components/SightingSheet";
import { SpotLife } from "../../components/SpotLife";
import { StorySheet } from "../../components/StorySheet";
import { EDIT_WINDOW_MS, editGrants, lastPerson } from "../../lib/local";
import { formatRemaining } from "../../lib/format";
import { t } from "../../lib/i18n";
import { navigate } from "../../lib/router";
import { storyInputFor } from "../../lib/story";
import { config, types } from "../../lib/store";
import type { SpotDetail } from "../../shared/types";
import { shareSpot } from "./actions";

interface Props {
  detail: SpotDetail;
  variant: "peek" | "full";
  onOpenPhoto: () => void;
  onReport: () => void;
  /** The life of the spot changed (a sighting was sent): reload the detail. */
  onChanged?: () => void;
}

/** Time left to edit, ticking every 30 s. 0 when the visitor did not upload this spot (or the 24 h are over). */
function useEditRemaining(id: string): number {
  const read = () => (editGrants.get(`spot:${id}`) ? Math.min(editGrants.remainingMs(`spot:${id}`), EDIT_WINDOW_MS) : 0);
  const [ms, setMs] = useState(read);
  useEffect(() => {
    setMs(read());
    const timer = setInterval(() => setMs(read()), 30_000);
    return () => clearInterval(timer);
  }, [id]);
  return ms;
}

/** The shared `mp-spot` block (SpotContent) plus what it does not render: note, "Otro" text and the edit countdown. */
export function SpotBody({ detail, variant, onOpenPhoto, onReport, onChanged }: Props) {
  const all = types.value;
  const order = new Map(all.map((tp) => [tp.slug, tp.sort_order]));
  const sorted = { ...detail, types: [...detail.types].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999)) };
  const view = toSpotView(sorted, all);
  const remaining = useEditRemaining(detail.id);
  const me = lastPerson.get() || undefined;
  const hasPhoto = Boolean(detail.photo);
  const instagram = config.value?.features.instagram === true;
  const [story, setStory] = useState(false);
  const sightingsOn = config.value?.features.sightings === true;
  const [checking, setChecking] = useState(false);
  const [lifeVersion, setLifeVersion] = useState(0);
  const storyInput = useMemo(() => (story ? storyInputFor(detail, all) : null), [story, detail, all]);

  return (
    <div class="map-spot">
      <SpotContent
        spot={view}
        variant={variant}
        me={me}
        onOpenPhoto={hasPhoto ? onOpenPhoto : undefined}
        onShare={() => void shareSpot(detail.id, view.place)}
        instagram={instagram}
        videoEnabled={config.value?.features.video === true}
        onShareStory={() => setStory(true)}
        onReport={onReport}
      />
      {variant === "full" && sightingsOn && detail.life_info && (
        <>
          <SpotLife detail={detail} version={lifeVersion} onCheck={() => setChecking(true)} />
          <SightingSheet
            open={checking}
            onClose={() => setChecking(false)}
            onDone={() => { setLifeVersion((n) => n + 1); onChanged?.(); }}
            spot={{ id: detail.id, lat: detail.lat, lng: detail.lng, place: view.place }}
          />
        </>
      )}
      {variant === "full" && detail.other_text && (
        <div class="mp-spot__meta">
          {t("map.spot.other")} <b>{detail.other_text}</b>
        </div>
      )}
      {variant === "full" && detail.note && <p class="mp-spot__meta map-spot__note">{detail.note}</p>}
      {variant === "full" && remaining > 0 && (
        <div class="mp-spot__owner">
          <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm" onClick={() => navigate(`/editar/${detail.id}`)}>
            <Icon name="pencil" size="sm" />
            {t("common.action.edit")}
          </button>
          <small>
            <Icon name="clock" size="sm" />
            {t("map.spot.editFor", { time: formatRemaining(remaining) })}
          </small>
        </div>
      )}
      {instagram && <StorySheet open={story} onClose={() => setStory(false)} link={`${location.origin}/s/${detail.id}`} filename={`mapa-papin-${detail.id}.png`} input={storyInput} />}
    </div>
  );
}
