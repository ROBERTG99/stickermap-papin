import { useEffect, useMemo, useState } from "preact/hooks";
import { BatchItem, BatchList, BatchSummary, SameStickerHint, batchFilterOf, type BatchFilter } from "../../components/BatchItem";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { t } from "../../lib/i18n";
import { isDesktop } from "../../lib/media";
import { navigate } from "../../lib/router";
import {
  allWithoutLocation, counts, defaults, dismissGroup, mergeGroup, omitAllWithoutLocation, omitPhoto, problem, readyRows, restorePhoto,
  reviewFilter, rows, sameGroups, submit, type Row,
} from "./bulk";
import { DefaultsCard } from "./Defaults";
import { BatchMap } from "./map";
import { ReviewBar } from "./Submit";
import { mapPoints, plural, Thumb, toBatchRow } from "./ui";
import type { SameGroup } from "./same-sticker";
import { cx } from "../../lib/cx";

export interface ReviewProps {
  /** Open the sheet of one photo: "Ubicar" for photos without a location, the editor for the others. */
  onOpen: (id: string) => void;
  /** A sheet is open: the keyboard shortcuts rest. */
  paused?: boolean;
}

const filterOf = (row: Row): BatchFilter => batchFilterOf(toBatchRow(row));

/** "¿Mismo sticker?" suggestions. "Juntar" asks which photo to keep; nothing merges without that tap. */
function SameHints() {
  const [merging, setMerging] = useState<SameGroup | null>(null);
  const [keep, setKeep] = useState<string | null>(null);
  const numbers = new Map(rows.value.map((r) => [r.photo.id, r.number]));
  const groups = sameGroups.value.slice(0, 3);
  const typeSlug = defaults.value?.types[0];
  if (groups.length === 0) return null;
  return (
    <div class="bulk-same">
      {groups.map((g) => (
        <SameStickerHint
          key={g.key}
          a={numbers.get(g.ids[0]!) ?? 1}
          b={numbers.get(g.ids[1]!) ?? 2}
          meters={g.meters}
          minutes={g.minutes}
          typeSlug={typeSlug}
          thumbs={[<Thumb id={g.ids[0]!} />, <Thumb id={g.ids[1]!} />]}
          onMerge={() => { setMerging(g); setKeep(g.ids[0]!); }}
          onKeepSeparate={() => dismissGroup(g)}
        />
      ))}
      <Dialog
        open={merging !== null}
        title={t("bulk.same.pickTitle")}
        onClose={() => setMerging(null)}
        art={
          <div class="bulk-same-pick" role="group" aria-label={t("bulk.same.pickTitle")}>
            {merging?.ids.map((id) => (
              <button key={id} type="button" aria-pressed={keep === id} aria-label={t("bulk.same.photo", { n: numbers.get(id) ?? 0 })} onClick={() => setKeep(id)}>
                <Thumb id={id} />
              </button>
            ))}
          </div>
        }
        actions={
          <>
            <button type="button" class="mp-btn mp-btn--primary" onClick={() => { if (merging && keep) mergeGroup(merging, keep); setMerging(null); }}>
              <Icon name="merge" />
              {t("bulk.same.merge")}
            </button>
            <button type="button" class="mp-btn mp-btn--secondary" onClick={() => setMerging(null)}>{t("bulk.same.cancel")}</button>
          </>
        }
      >
        {t("bulk.same.pickBody")}
      </Dialog>
    </div>
  );
}

/** Step 3 of the flow: summary chips, map, batch defaults, hints and the list of photos. */
export function ReviewView({ onOpen, paused }: ReviewProps) {
  const desktop = isDesktop.value;
  const d = defaults.value;
  const filter = reviewFilter.value;
  const c = counts.value;
  const [selected, setSelected] = useState<string | null>(null);
  const [showProblem, setShowProblem] = useState(false);
  const p = problem.value;

  const located = readyRows.value;
  const points = useMemo(() => mapPoints(located), [located.map((r) => `${r.photo.id}:${r.photo.placed?.lat ?? r.photo.lat}:${r.photo.placed?.lng ?? r.photo.lng}:${d ? (r.photo.override.types ?? d.types)[0] : ""}`).join("|")]);

  useEffect(() => { if (p === null) setShowProblem(false); }, [p]);

  const visible = rows.value.filter((r) => filter === "all" || filterOf(r) === filter);

  // Desktop keyboard (design note 19k): J/K move between photos, U places the selected one, Supr leaves it out.
  useEffect(() => {
    if (!desktop || paused) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=alertdialog]")) return;
      const at = visible.findIndex((r) => r.photo.id === selected);
      const key = e.key.toLowerCase();
      if (key === "j" || key === "k") {
        const next = visible[Math.max(0, Math.min(visible.length - 1, at + (key === "j" ? 1 : -1)))];
        if (next) { setSelected(next.photo.id); document.querySelectorAll("li.mp-bitem")[visible.indexOf(next)]?.scrollIntoView({ block: "nearest" }); }
      } else if (key === "u" && visible[at]?.status === "no-location") onOpen(visible[at]!.photo.id);
      else if ((e.key === "Delete" || e.key === "Backspace") && visible[at] && (visible[at]!.status === "ready" || visible[at]!.status === "no-location")) omitPhoto(visible[at]!.photo.id);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  const openRow = (row: Row) => {
    setSelected(row.photo.id);
    if (row.status === "ready" || row.status === "no-location") onOpen(row.photo.id);
  };

  // Rows are `li` without props: one delegated handler finds the row by its position in the list.
  const rowAt = (target: EventTarget | null): Row | undefined => {
    const li = (target as HTMLElement | null)?.closest("li.mp-bitem");
    if (!li || (target as HTMLElement).closest("button, a")) return undefined;
    return visible[Array.from(li.parentElement?.children ?? []).indexOf(li)];
  };

  const showDefaults = () => {
    setShowProblem(true);
    document.getElementById("bulk-defaults")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const list = (
    <>
      <div class="bulk-filterbar">
        <BatchSummary
          filter={filter}
          counts={{ all: c.all, ready: c.ready, noloc: c.noloc, skipped: c.skipped }}
          onFilterChange={(f) => { reviewFilter.value = f; }}
        />
        {filter === "noloc" && c.noloc > 0 && <div class="mp-banner mp-banner--error" role="status"><Icon name="alert" />{plural(c.noloc, "bulk.noloc.bannerOne", "bulk.noloc.banner")}</div>}
      </div>
      {allWithoutLocation.value && <div class="mp-banner mp-banner--info" role="status"><Icon name="info" />{t("bulk.allNoloc")}</div>}
      {d && <DefaultsCard d={d} problem={p} showProblem={showProblem} />}
      <SameHints />
      {visible.length === 0 ? (
        <p class="bulk__lead" role="status">{t("bulk.list.empty")}</p>
      ) : (
        <div
          onClick={(e) => { const r = rowAt(e.target); if (r) openRow(r); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            const r = rowAt(e.target);
            if (r) { e.preventDefault(); openRow(r); }
          }}
        >
          <BatchList label={t("bulk.list.aria")}>
            {visible.map((row) => (
              <BatchItem
                key={row.photo.id}
                row={toBatchRow(row)}
                index={row.number - 1}
                number={row.number}
                selected={selected === row.photo.id}
                thumb={<Thumb id={row.photo.id} />}
                onEdit={() => openRow(row)}
                onLocate={() => openRow(row)}
                onSkip={() => omitPhoto(row.photo.id)}
                onRestore={() => restorePhoto(row.photo.id)}
                onView={() => row.photo.existsId && navigate(`/s/${row.photo.existsId}`)}
              />
            ))}
          </BatchList>
        </div>
      )}
      {filter === "noloc" && c.noloc > 1 && (
        <button type="button" class="mp-btn mp-btn--secondary" onClick={omitAllWithoutLocation}>{t("bulk.noloc.skipAll", { n: c.noloc })}</button>
      )}
    </>
  );

  const bar = <ReviewBar count={c.ready} unplaced={c.noloc} problem={p} onSubmit={() => void submit()} onShowProblem={showDefaults} />;
  const map = (
    <BatchMap points={points} selectedId={selected} onSelect={(id) => setSelected(id)} fitKey={points.length === 0 ? "none" : "some"} label={t("bulk.map.aria")} class={cx(!desktop && "bulk-map--mini")}>
      <span class="bulk-map__count"><span class="mp-src">{t("bulk.map.count", { n: points.length })}</span></span>
    </BatchMap>
  );

  if (desktop) {
    return (
      <div class="bulk__split">
        <div class="bulk__pane">
          <div class="bulk__pane-body">
            <h1 class="bulk__title">{plural(c.all, "bulk.review.titleOne", "bulk.review.title")}</h1>
            {list}
          </div>
          {bar}
        </div>
        <div class="bulk__mappane">{map}</div>
      </div>
    );
  }
  return (
    <>
      <div class="bulk__main">
        {points.length > 0 && map}
        {list}
      </div>
      {bar}
    </>
  );
}
