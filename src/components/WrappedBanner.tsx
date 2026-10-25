import { useState } from "preact/hooks";
import { t } from "../lib/i18n";
import { lastPerson, storage } from "../lib/local";
import { navigate } from "../lib/router";
import { config, spots } from "../lib/store";
import { personYear, toWSpots, wrappedOpen } from "../lib/wrapped";
import { cx } from "../lib/cx";

const DAY = 86_400_000;

/** "Ya salió tu Papin Wrapped" (F5): once a year, only for someone who stuck something that year; "Después" hides it for 3 days. */
export function WrappedBanner({ class: className }: { class?: string }) {
  const [, rerender] = useState(0);
  const now = Date.now();
  const year = new Date(now).getUTCFullYear();
  const person = lastPerson.get();
  if (config.value?.features.globe_wrapped !== true || !person || !wrappedOpen(year, now, config.value.wrapped_preview === true)) return null;
  const state = storage.get<{ seen?: boolean; until?: number }>(`wrapped:${year}`, {});
  if (state.seen || (state.until ?? 0) > now) return null;
  const features = spots.value?.features;
  if (!features?.length) return null;
  const py = personYear(toWSpots(features), person, year, now);
  if (py.placed.length === 0) return null;

  return (
    <div class={cx("mp-hint", className)} role="region" aria-label={t("wrapped.title")}>
      <div class="mp-hint__row">
        <span class="mp-sticker mp-sticker--contain" style={{ "--s": "44px", "--tilt": "var(--tilt-1)" }}><img src="/img/icons/papa.png" alt="" /></span>
        <span><b>{t("wrapped.bannerTitle", { year })}</b> {t("wrapped.bannerBody", { n: py.placed.length, c: py.countries.length })}</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" class="mp-btn mp-btn--primary" onClick={() => { storage.set(`wrapped:${year}`, { seen: true }); navigate(`/wrapped/${year}/${encodeURIComponent(person)}`); }}>{t("wrapped.see")}</button>
        <button type="button" class="mp-btn mp-btn--quiet" onClick={() => { storage.set(`wrapped:${year}`, { until: now + 3 * DAY }); rerender((n) => n + 1); }}>{t("wrapped.later")}</button>
      </div>
    </div>
  );
}
