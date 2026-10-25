import { useState } from "preact/hooks";
import { LocationPicker, type LocationState } from "../components/LocationPicker";
import { StickerCard } from "../components/StickerCard";
import { formatCoords } from "../lib/format";
import { t } from "../lib/i18n";
import { isDesktop } from "../lib/media";
import { LocationMap } from "./LocationMap";
import { fallbackView, type AddForm } from "./useAddForm";

/** The nine states of the design's LocationPicker, derived from what the form knows. */
export function pickerState(s: AddForm["s"]): LocationState {
  const { choice, conflict, resolving, paste, revert } = s;
  if (conflict) {
    return {
      kind: "conflict",
      selected: choice?.source === "device" ? "device" : "exif",
      distanceKm: Math.round(conflict.km),
      exif: { place: conflict.exifName, map: <ConflictPin at={s.exif} /> },
      device: { place: conflict.deviceName, map: <ConflictPin at={s.device} /> },
    };
  }
  if (resolving) return { kind: "resolving" };
  if (!choice) return { kind: "empty" };
  switch (choice.source) {
    case "exif": return { kind: "exif", media: s.exifFromVideo ? "video" : undefined };
    case "device": return { kind: "device", accuracyM: choice.accuracyM ?? 0 };
    case "search": return { kind: "search" };
    case "paste": return { kind: "link", text: paste?.text ?? "", coords: formatCoords(choice.lat, choice.lng) };
    default: return { kind: "moved", from: revert && revert.source !== "pin" ? revert.source : undefined };
  }
}

/** Static stand-in for the real map inside a conflict option (one WebGL map is enough). */
function ConflictPin({ at }: { at: { lat: number; lng: number } | null }) {
  return (
    <div class="add-conflict-pin">
      <span class="mp-pin" aria-hidden="true">
        <span class="mp-pin__head" />
        <span class="mp-pin__shadow" />
      </span>
      {at && <span class="mp-field__hint" style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>{formatCoords(at.lat, at.lng)}</span>}
    </div>
  );
}

/** Card 2, Ubicación. On desktop the map moves to the right column (`DesktopMap`) and the tools stay here. */
export function LocationCard({ form }: { form: AddForm }) {
  const { s, actions } = form;
  const desktop = isDesktop.value;
  const [big, setBig] = useState(false);
  const state = pickerState(s);
  const view = fallbackView();
  const done = !!s.choice && !s.resolving && !s.conflict;
  const invalid = s.attempted && !s.choice;

  return (
    <StickerCard
      id="add-card-2"
      step={2}
      title={t("add.location.title")}
      state={s.resolving ? "processing" : done ? "done" : invalid ? "invalid" : "default"}
      status={s.resolving ? t("add.location.resolving") : t("add.status.missing")}
      error={invalid ? t("add.location.error") : undefined}
    >
      <div class={`add-flat add-loc${big ? " add-loc--big" : ""}`}>
        <LocationPicker
          state={state}
          approximate={s.approximate}
          onApproximateChange={(approximate) => form.set({ approximate })}
          onUseDevice={() => void actions.requestDevice(false)}
          onSearch={(q) => void actions.search(q)}
          searchResults={s.results.map((p) => ({ id: p.id, label: p.label }))}
          onPickResult={actions.pickResult}
          onPaste={actions.pasteText}
          pasteError={s.pasteError ?? undefined}
          onPickConflict={actions.pickConflict}
          onRevert={actions.revertPin}
          locateDenied={s.denied}
        >
          {!desktop && (
            <LocationMap
              pin={s.choice}
              fallback={view}
              focus={s.focus}
              onPick={actions.setPin}
              expanded={big}
              onToggleExpand={() => setBig((v) => !v)}
            />
          )}
        </LocationPicker>
      </div>
    </StickerCard>
  );
}

/** The big map of the desktop layout (right column of Page04AddDesktop). */
export function DesktopMap({ form }: { form: AddForm }) {
  const { s, actions } = form;
  return (
    <LocationMap
      big
      pin={s.choice}
      fallback={fallbackView()}
      focus={s.focus}
      onPick={actions.setPin}
      onLocate={() => void actions.requestDevice(false)}
    />
  );
}
