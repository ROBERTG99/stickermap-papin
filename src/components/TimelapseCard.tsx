import { useEffect, useRef } from "preact/hooks";
import { formatNumber } from "../lib/format";
import { lang, t } from "../lib/i18n";
import { prefersReducedMotion } from "../lib/media";
import { filteredFeatures, timelapse, timelapseRange, visibleFeatures, type TimelapseSpeed } from "../pages/map/state";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";

/** How long the whole history takes to play at each speed. */
const FULL_RUN_MS: Record<TimelapseSpeed, number> = { 1: 40_000, 4: 10_000, 16: 2_500 };
const MONTHS = { es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"], en: ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] } as const;

export const formatMonthYear = (ms: number, l: "es" | "en"): string => {
  const d = new Date(ms);
  return `${MONTHS[l][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Map time-lapse (F5, design `mp-tl`): play/pause, the month, how many stickers so far, speed and a date scrubber. */
export function TimelapseCard({ class: className }: { class?: string }) {
  const tl = timelapse.value;
  const range = timelapseRange.value;
  const frame = useRef(0);

  useEffect(() => {
    if (!tl.playing || !range) return;
    let last = performance.now();
    const tick = (now: number) => {
      const cur = timelapse.value;
      if (!cur.playing) return;
      const total = Math.max(1, range.max - range.min);
      const step = ((now - last) / FULL_RUN_MS[cur.speed]) * total;
      last = now;
      const t = Math.min(range.max, cur.t + step);
      timelapse.value = { ...cur, t, playing: t < range.max };
      if (t < range.max) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [tl.playing, tl.speed, range?.min, range?.max]);

  if (!tl.active || !range) return null;
  const reduce = prefersReducedMotion.value;
  const pct = range.max === range.min ? 100 : Math.round(((tl.t - range.min) / (range.max - range.min)) * 100);
  const l = lang.value;

  const toggle = () => {
    const cur = timelapse.value;
    // at the end, play starts over
    const t = cur.t >= range.max ? range.min : cur.t;
    timelapse.value = { ...cur, t, playing: !cur.playing };
  };

  return (
    <div class={`mp-tl${className ? ` ${className}` : ""}`} role="group" aria-label={t("map.globe.storyLabel")}>
      <div class="mp-tl__row">
        <button type="button" class="mp-btn mp-btn--primary mp-btn--icon" aria-label={t(tl.playing ? "map.globe.pause" : "map.globe.play")} onClick={toggle}>
          <Icon name={tl.playing ? "pause" : "play"} />
        </button>
        <div>
          <div class="mp-tl__month" aria-live="off">{formatMonthYear(tl.t, l)}</div>
          <div class="mp-tl__count">{t("map.globe.count", { n: formatNumber(visibleFeatures.value.length), total: formatNumber(filteredFeatures.value.length) })}</div>
        </div>
        <Segmented<"1" | "4" | "16">
          ariaLabel={t("map.globe.speed")}
          value={String(tl.speed) as "1" | "4" | "16"}
          onChange={(v) => { timelapse.value = { ...timelapse.value, speed: Number(v) as TimelapseSpeed }; }}
          options={[{ value: "1", label: "×1" }, { value: "4", label: "×4" }, { value: "16", label: "×16" }]}
        />
        <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label={t("map.globe.close")} onClick={() => { timelapse.value = { ...timelapse.value, active: false, playing: false }; }}>
          <Icon name="x" />
        </button>
      </div>
      <input
        class="mp-range" type="range" min={range.min} max={range.max} step={Math.max(1, Math.round((range.max - range.min) / 500))} value={tl.t}
        aria-label={t("map.globe.date")} style={{ "--value": `${pct}%` }}
        onInput={(e) => { timelapse.value = { ...timelapse.value, t: Number(e.currentTarget.value), playing: false }; }}
      />
      <div class="mp-bars__axis"><span>{formatMonthYear(range.min, l)}</span><span>{formatMonthYear(range.max, l)}</span></div>
      {reduce && <span class="mp-field__hint">{t("map.globe.reduced")}</span>}
    </div>
  );
}
