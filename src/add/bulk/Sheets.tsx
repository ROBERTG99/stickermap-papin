import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { LocationSuggestion } from "../../components/BatchItem";
import { BottomSheet } from "../../components/BottomSheet";
import { TypeGrid } from "../../components/Chip";
import { TextAreaField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { LocationBadge, LocationPicker, type LocationState, type SearchResult } from "../../components/LocationPicker";
import { loadRecentPlacers, WhoPlaced, validateWhoPlaced, type WhoPlacedValue } from "../../components/WhoPlaced";
import { t } from "../../lib/i18n";
import { formatCoords } from "../../lib/format";
import { parseLocationText, type ParseFailure } from "../../lib/geo-parse";
import { people, types } from "../../lib/store";
import { toast } from "../../lib/toast";
import { effectiveCoords } from "./classify";
import { clockOf, effectiveOtherText, effectivePlacer, effectiveTypes } from "./effective";
import { defaults, omitPhoto, placePhoto, readyRows, rows, setOverride, type Row } from "./bulk";
import { PinMap } from "./map";
import { searchPlaces, reverseName, cachedName, type PlaceHit } from "./places";
import { nearestInTime } from "./same-sticker";
import { Thumb, whereLabel } from "./ui";
import type { PhotoOverride, PlacedSource } from "./types";

interface LatLng { lat: number; lng: number }

/** Where the rest of the batch is: the search bias and the map's starting view while a photo has no pin. */
function batchCenter(): LatLng | null {
  const pts = readyRows.value.map((r) => effectiveCoords(r.photo)).filter((c): c is LatLng => c.lat !== null && c.lng !== null);
  if (pts.length === 0) return null;
  return { lat: pts.reduce((n, c) => n + c.lat, 0) / pts.length, lng: pts.reduce((n, c) => n + c.lng, 0) / pts.length };
}

const PARSE_ERROR: Record<ParseFailure, string> = {
  empty: "bulk.locate.parse.invalid",
  invalid: "bulk.locate.parse.invalid",
  out_of_range: "bulk.locate.parse.range",
  short_link: "bulk.locate.parse.short",
};

interface LocateStepProps {
  row: Row;
  onConfirm: (loc: { lat: number; lng: number; source: PlacedSource }) => void;
  onOmit?: () => void;
  /** Back to the editor without changing anything (the photo's own EXIF pin was kept). */
  onBack: () => void;
  /** The photo already has a location (its EXIF fix or an earlier pin): the pin starts there. */
  start: LatLng | null;
  startSource: "exif" | PlacedSource | null;
}

/**
 * "¿Dónde está este sticker?": search, pasted link or coordinates, or the pin. The suggestion (the nearest-in-time located photo)
 * only moves the pin there; the user still confirms it. The device position is never offered.
 */
function LocateStep({ row, onConfirm, onOmit, onBack, start, startSource }: LocateStepProps) {
  const photo = row.photo;
  const [pin, setPin] = useState<LatLng | null>(start);
  const [source, setSource] = useState<"exif" | PlacedSource | null>(startSource);
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState<string | undefined>();
  const abort = useRef<AbortController | null>(null);
  const center = useMemo(batchCenter, []);
  const origin = useMemo(() => (photo.lat !== null && photo.lng !== null ? { lat: photo.lat, lng: photo.lng } : null), []);

  const suggestion = useMemo(() => {
    if (start) return null;
    const candidates = readyRows.value
      .filter((r) => r.photo.id !== photo.id)
      .flatMap((r) => {
        const c = effectiveCoords(r.photo);
        return c.lat === null || c.lng === null ? [] : [{ id: r.photo.id, lat: c.lat, lng: c.lng, takenAt: r.photo.takenAt }];
      });
    return nearestInTime(photo.takenAt, candidates);
  }, []);
  const [suggestionName, setSuggestionName] = useState<string | null>(suggestion ? cachedName(suggestion.lat, suggestion.lng) : null);
  useEffect(() => {
    if (suggestion && !suggestionName) void reverseName(suggestion.lat, suggestion.lng).then(setSuggestionName);
  }, []);

  const moveTo = (p: LatLng, src: "exif" | PlacedSource) => { setPin(p); setSource(src); setPasteError(undefined); };

  const onSearch = (q: string) => {
    abort.current?.abort();
    if (!q) { setHits([]); return; }
    const ctl = new AbortController();
    abort.current = ctl;
    searchPlaces(q, center ?? undefined, ctl.signal)
      .then(setHits)
      .catch((e: unknown) => { if ((e as Error).name !== "AbortError") toast.show({ kind: "error", message: t("bulk.locate.searchFailed") }); });
  };

  const onPaste = (text: string) => {
    const parsed = parseLocationText(text);
    if (!parsed.ok) { setPasteError(t(PARSE_ERROR[parsed.reason])); return; }
    setPasteText(text);
    moveTo({ lat: parsed.lat, lng: parsed.lng }, "paste");
  };

  const state: LocationState =
    !pin ? { kind: "empty" }
    : source === "search" ? { kind: "search" }
    : source === "paste" ? { kind: "link", text: pasteText, coords: formatCoords(pin.lat, pin.lng) }
    : source === "exif" ? { kind: "exif" }
    : { kind: "moved", from: origin && startSource === "exif" ? "exif" : undefined };

  const results: SearchResult[] = hits.map((h) => ({ id: h.id, label: h.label }));
  const time = clockOf(photo.takenAt);

  return (
    <div class="bulk-sheet">
      <div class="bulk-sheet__head">
        <div class="bulk-sheet__thumb"><Thumb id={photo.id} /></div>
        <div>
          <h3 class="bulk-sheet__title">{t("bulk.locate.title")}</h3>
          <span class="bulk-sheet__sub">{time ? t("bulk.locate.sub", { n: row.number, time }) : t("bulk.locate.subNoTime", { n: row.number })}</span>
        </div>
      </div>

      {suggestion && !pin && (
        <LocationSuggestion
          time={clockOf(suggestion.takenAt) ?? ""}
          place={suggestionName ?? formatCoords(suggestion.lat, suggestion.lng)}
          hint={t("bulk.locate.suggestHint")}
          onUse={() => moveTo({ lat: suggestion.lat, lng: suggestion.lng }, "pin")}
        />
      )}

      <div class="bulk-picker">
        <LocationPicker
          state={state}
          approximate={false}
          onApproximateChange={() => undefined}
          onUseDevice={() => undefined}
          onSearch={onSearch}
          onPickResult={(r) => { const hit = hits.find((h) => h.id === r.id); if (hit) moveTo({ lat: hit.lat, lng: hit.lng }, "search"); }}
          onPaste={onPaste}
          onPickConflict={() => undefined}
          onRevert={origin ? () => moveTo(origin, "exif") : undefined}
          searchResults={results}
          pasteError={pasteError}
        >
          <PinMap pin={pin} center={center} onPin={(lat, lng) => moveTo({ lat, lng }, "pin")} />
        </LocationPicker>
      </div>

      <div class="bulk-sheet__actions">
        <button
          type="button"
          class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block"
          disabled={!pin}
          onClick={() => {
            if (!pin || !source) return;
            if (source === "exif") onBack();
            else onConfirm({ ...pin, source });
          }}
        >
          <Icon name="check" />
          {t("bulk.locate.confirm")}
        </button>
        {onOmit && (
          <button type="button" class="mp-btn mp-btn--quiet" onClick={onOmit}>{t("bulk.locate.omit")}</button>
        )}
      </div>
    </div>
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Tap a photo: change its type(s), who stuck it, its pin, add a note, or leave it out. The rest keeps "Para todas". */
function EditStep({ row, onDone, onMovePin }: { row: Row; onDone: () => void; onMovePin: () => void }) {
  const photo = row.photo;
  const d = defaults.value!;
  const [slugs, setSlugs] = useState(effectiveTypes(photo, d));
  const [otherText, setOtherText] = useState(effectiveOtherText(photo, d));
  const [placer, setPlacer] = useState<WhoPlacedValue>(effectivePlacer(photo, d));
  const [note, setNote] = useState(photo.override.note ?? "");
  const onPlacer = useCallback((p: WhoPlacedValue) => setPlacer(p), []);
  const time = clockOf(photo.takenAt);
  const placerError = validateWhoPlaced(placer);
  const canSave = slugs.length > 0 && !placerError;
  const where = whereLabel(photo);

  const save = () => {
    if (!canSave) return;
    const next: PhotoOverride = {};
    if (!sameSet(slugs, d.types) || otherText !== d.otherText) { next.types = slugs; next.otherText = otherText; }
    if (JSON.stringify(placer) !== JSON.stringify(d.placer)) next.placer = placer;
    if (note.trim()) next.note = note.trim();
    setOverride(photo.id, next);
    onDone();
  };

  return (
    <div class="bulk-sheet">
      <div class="bulk-sheet__head">
        <div class="bulk-sheet__thumb"><Thumb id={photo.id} /></div>
        <div>
          <h3 class="bulk-sheet__title">{where}</h3>
          <span class="bulk-sheet__sub">{time ? t("bulk.edit.sub", { n: row.number, time }) : t("bulk.edit.subNoTime", { n: row.number })}</span>
        </div>
      </div>

      <div class="bulk-sheet__src">
        <LocationBadge source={photo.placed ? photo.placed.source : "exif"} />
        <button type="button" class="mp-btn mp-btn--secondary mp-btn--sm" onClick={onMovePin}>
          <Icon name="pin" size="sm" />
          {t("bulk.edit.movePin")}
        </button>
      </div>

      <div class="bulk__stack">
        <span class="bulk-defaults__label">{t("bulk.edit.type")}</span>
        <TypeGrid types={types.value} value={slugs} onChange={setSlugs} otherText={otherText} onOtherTextChange={setOtherText} label={t("bulk.defaults.typeAria")} />
      </div>

      <WhoPlaced
        value={placer}
        onChange={onPlacer}
        soy={d.soy}
        people={people.value}
        recent={loadRecentPlacers()}
        error={placerError}
        onRequestSoy={() => toast.show({ message: t("bulk.edit.needSoy") })}
      />

      <TextAreaField label={t("bulk.edit.note")} value={note} maxLength={280} onInput={(e) => setNote(e.currentTarget.value)} />

      <div class="bulk-sheet__actions">
        <button type="button" class="mp-btn mp-btn--primary mp-btn--lg mp-btn--block" disabled={!canSave} onClick={save}>{t("bulk.edit.done")}</button>
        <button type="button" class="mp-btn mp-btn--quiet" onClick={() => { omitPhoto(photo.id); onDone(); }}>{t("bulk.edit.omit")}</button>
      </div>
    </div>
  );
}

/** The one sheet of the review: "Ubicar" for a photo without a location, the editor for the others. */
export function PhotoSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const row = id ? rows.value.find((r) => r.photo.id === id) : undefined;
  const [moving, setMoving] = useState(false);
  useEffect(() => setMoving(false), [id]);
  const keep = useRef<Row | undefined>(undefined);
  if (row) keep.current = row;
  const shown = row ?? keep.current;

  const place = (loc: { lat: number; lng: number; source: PlacedSource }) => {
    if (!shown) return;
    placePhoto(shown.photo.id, loc);
    if (shown.status === "no-location") toast.show({ message: t("bulk.locate.placed"), kind: "success" });
    if (shown.status === "ready") setMoving(false);
    else onClose();
  };

  const own = shown ? effectiveCoords(shown.photo) : null;
  const ownSource = shown?.photo.placed ? shown.photo.placed.source : shown && own?.lat !== null && own?.lat !== undefined ? "exif" : null;

  return (
    <BottomSheet open={id !== null && !!shown} snap="expanded" onSnapChange={() => undefined} onClose={onClose} title={t("bulk.sheet.aria")} modal aboveTabBar={false}>
      {shown && (shown.status === "no-location" || moving ? (
        <LocateStep
          key={`${shown.photo.id}:${moving}`}
          row={shown}
          onConfirm={place}
          onOmit={shown.status === "ready" ? undefined : () => { omitPhoto(shown.photo.id); onClose(); }}
          onBack={() => setMoving(false)}
          start={moving && own && own.lat !== null && own.lng !== null ? { lat: own.lat, lng: own.lng } : null}
          startSource={moving ? ownSource : null}
        />
      ) : (
        <EditStep key={shown.photo.id} row={shown} onDone={onClose} onMovePin={() => setMoving(true)} />
      ))}
    </BottomSheet>
  );
}

