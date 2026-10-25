import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { lang, t } from "../lib/i18n";
import type { SightingView, SpotDetail } from "../shared/types";
import { Icon, type IconName } from "./Icon";
import { LifeBadge } from "./LifeStatus";

const DOT: Record<SightingView["status"], { icon: IconName; kind: "alive" | "gone" | "" }> = {
  alive: { icon: "check", kind: "alive" },
  damaged: { icon: "damaged", kind: "" },
  covered: { icon: "covered", kind: "gone" },
  removed: { icon: "gone", kind: "gone" },
  moved: { icon: "navigation", kind: "" },
};

/** Draggable split between two photos (F4 before/after). Arrow keys move the knob. */
function Compare({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const [split, setSplit] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setSplit(Math.max(0, Math.min(100, Math.round(((clientX - r.left) / r.width) * 100))));
  };
  return (
    <div
      ref={box}
      class="mp-compare"
      style={{ "--split": `${split}%`, touchAction: "pan-y" }}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => { if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) move(e.clientX); }}
    >
      <div class="mp-photo" style={{ "--ratio": "4/3" }}><img src={before} alt="" loading="lazy" style={{ objectFit: "cover" }} /></div>
      <div class="mp-compare__after"><div class="mp-photo" style={{ "--ratio": "4/3" }}><img src={after} alt="" loading="lazy" style={{ objectFit: "cover" }} /></div></div>
      <span class="mp-compare__handle" />
      <span
        class="mp-compare__knob" role="slider" tabIndex={0} aria-label={t("components.life.compare")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={split}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); setSplit((s) => Math.max(0, s - 5)); }
          if (e.key === "ArrowRight") { e.preventDefault(); setSplit((s) => Math.min(100, s + 5)); }
        }}
      >
        <Icon name="move-h" />
      </span>
      <span class="mp-compare__tag mp-compare__tag--before">{beforeLabel}</span>
      <span class="mp-compare__tag mp-compare__tag--after">{afterLabel}</span>
    </div>
  );
}

/** What F4 adds to the spot sheet: before/after, the life badge with its count, "¿Sigue ahí?" and the history. */
export function SpotLife({ detail, onCheck, version }: { detail: SpotDetail; onCheck: () => void; version: number }) {
  const [rows, setRows] = useState<SightingView[] | null>(null);
  const life = detail.life_info;

  useEffect(() => {
    let alive = true;
    api.sightings(detail.id, version > 0).then((r) => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [detail.id, version]);

  if (!life) return null;
  const l = lang.value;
  const newest = rows?.find((r) => r.photo && !r.pending && r.status !== "removed") ?? rows?.find((r) => r.photo && !r.pending);
  const showCompare = !!detail.photo && !!newest?.photo;

  return (
    <div class="spot-life" style={{ display: "grid", gap: "var(--space-3)" }}>
      {showCompare && newest?.photo && (
        <Compare before={detail.photo!} after={newest.photo} beforeLabel={formatDate(life.placed_at, l)} afterLabel={formatDate(newest.created_at, l)} />
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <LifeBadge life={life} />
        {life.count > 0 && (
          <span class="mp-badge"><Icon name="history" size="sm" />{t(life.count === 1 ? "components.life.countOne" : "components.life.count", { n: life.count })}</span>
        )}
      </div>
      <button type="button" class="mp-btn mp-btn--primary mp-btn--block" onClick={onCheck}>
        <Icon name="eye" size="sm" />
        {t("components.life.check")}
      </button>
      {rows && rows.length > 0 && (
        <ol class="mp-timeline" aria-label={t("components.life.timeline")}>
          {rows.map((r) => {
            const dot = DOT[r.status];
            return (
              <li key={r.id} class="mp-timeline__item">
                <span class={`mp-timeline__dot${dot.kind ? ` mp-timeline__dot--${dot.kind}` : ""}`}><Icon name={dot.icon} /></span>
                <div>
                  <div class="mp-timeline__title">{t(`components.life.status.${r.status}`)}</div>
                  <div class="mp-timeline__meta">
                    {[r.reporter ?? t("components.life.anonymous"), formatDate(r.created_at, l), r.pending ? t("components.life.pending") : r.verified ? t("components.life.verified") : null].filter(Boolean).join(" · ")}
                  </div>
                  {r.note && <div class="mp-timeline__meta">{r.note}</div>}
                </div>
                {r.thumb ? <div class="mp-timeline__thumb"><div class="mp-photo"><img src={r.thumb} alt="" loading="lazy" /></div></div> : <span />}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
