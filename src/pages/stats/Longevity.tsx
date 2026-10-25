import { useEffect, useState } from "preact/hooks";
import { Flag } from "../../components/Flag";
import { Skeleton } from "../../components/Skeleton";
import { api, type LongevityPayload } from "../../lib/api";
import { formatDate, formatDays, formatNumber } from "../../lib/format";
import { lang, t } from "../../lib/i18n";
import { typeBySlug } from "../../lib/store";

const W = 320;
const H = 160;
const PAD = { l: 34, r: 8, t: 8, b: 22 };
const MAX_DAYS = 720;

/** Survival curves: share of stickers still standing vs days since they were stuck. Each line has its own dash pattern (never colour alone). */
function Curves({ curves }: { curves: LongevityPayload["curves"] }) {
  const shown = curves.slice(0, 4);
  const x = (day: number) => PAD.l + (day / MAX_DAYS) * (W - PAD.l - PAD.r);
  const y = (alive: number) => PAD.t + (1 - alive) * (H - PAD.t - PAD.b);
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("stats.longevity.curves")} style={{ width: "100%", maxWidth: 520, height: "auto" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" stroke-width="1" />
            <text x={PAD.l - 4} y={y(v) + 3} text-anchor="end" font-size="9" fill="var(--ink-muted)">{Math.round(v * 100)}%</text>
          </g>
        ))}
        {[0, 180, 360, 540, 720].map((d) => (
          <text key={d} x={x(d)} y={H - 6} text-anchor="middle" font-size="9" fill="var(--ink-muted)">{d}</text>
        ))}
        {shown.map((c, i) => (
          <path key={c.key} class={`mp-route mp-route--${i + 1}`} style={{ strokeWidth: 2.5 }} d={c.points.map((p, j) => `${j === 0 ? "M" : "L"}${x(p.day).toFixed(1)} ${y(p.alive).toFixed(1)}`).join(" ")} />
        ))}
      </svg>
      <div class="mp-routekey">
        {shown.map((c, i) => (
          <span key={c.key} class="mp-routekey__row">
            <svg viewBox="0 0 34 10" aria-hidden="true"><path class={`mp-route mp-route--${i + 1}`} d="M2 5H32" /></svg>
            {c.key === "all" ? t("stats.longevity.all") : c.label}
          </span>
        ))}
      </div>
      <span class="mp-field__hint">{t("stats.longevity.curvesHint")}</span>
    </div>
  );
}

/** Longevidad (F4): the oldest living stickers, how long each type lasts, the cemetery and survival curves. */
export function Longevity() {
  const [data, setData] = useState<LongevityPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.longevity().then(setData).catch(() => setFailed(true)); }, []);
  const l = lang.value;

  if (failed) return null;
  if (!data) return <Skeleton variant="block" height={160} />;
  const typeName = (slugs: string[]) => typeBySlug.value.get(slugs[0] ?? "")?.label ?? "";
  const maxAvg = Math.max(1, ...data.by_type.map((x) => x.avg_days));

  return (
    <>
      <section class="wide" style={{ display: "grid", gap: 12 }}>
        <h2 class="t-heading">{t("stats.longevity.title")}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span class="mp-life mp-life--alive">{t("components.life.alive")} · {formatNumber(data.totals.alive)}</span>
          <span class="mp-life mp-life--unknown">{t("components.marker.noNews")} · {formatNumber(data.totals.unknown)}</span>
          <span class="mp-life mp-life--gone">{t("components.marker.gone")} · {formatNumber(data.totals.dead)}</span>
        </div>
      </section>
      {data.oldest_living.length > 0 && (
        <section style={{ display: "grid", gap: 12 }}>
          <h2 class="t-heading">{t("stats.longevity.oldest")}</h2>
          <ol class="mp-board">
            {data.oldest_living.map((r, i) => (
              <li key={r.id}>
                <a class="mp-board__row" href={`/s/${r.id}`}>
                  <span class={`mp-medal mp-medal--${i < 3 ? i + 1 : "n"}`}>{i + 1}</span>
                  {r.country_code ? <Flag code={r.country_code} /> : <span />}
                  <span class="mp-board__name">{[typeName(r.types), r.place_name].filter(Boolean).join(" · ")}</span>
                  <span class="mp-board__count">{formatDays(r.age_days, l)}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
      {data.by_type.length > 0 && (
        <section style={{ display: "grid", gap: 12 }}>
          <h2 class="t-heading">{t("stats.longevity.byType")}</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {data.by_type.map((r) => (
              <div key={r.key} style={{ display: "grid", gap: 4 }}>
                <span style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}><span>{r.label}</span><span>{formatDays(r.avg_days, l)}</span></span>
                <span class="mp-progress" aria-hidden="true"><span class="mp-progress__bar" style={{ "--value": `${Math.max(2, Math.round((r.avg_days / maxAvg) * 100))}%` }} /></span>
              </div>
            ))}
          </div>
        </section>
      )}
      {data.by_city.length > 0 && (
        <section style={{ display: "grid", gap: 12 }}>
          <h2 class="t-heading">{t("stats.longevity.byCity")}</h2>
          <ol class="mp-board">
            {data.by_city.map((r, i) => (
              <li key={r.key}>
                <span class="mp-board__row">
                  <span class={`mp-medal mp-medal--${i < 3 ? i + 1 : "n"}`}>{i + 1}</span>
                  <span />
                  <span class="mp-board__name">{r.label}</span>
                  <span class="mp-board__count">{formatDays(r.avg_days, l)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {data.curves.length > 0 && (
        <section class="wide" style={{ display: "grid", gap: 12 }}>
          <h2 class="t-heading">{t("stats.longevity.curves")}</h2>
          <Curves curves={data.curves} />
        </section>
      )}
      <section style={{ display: "grid", gap: 12 }}>
        <h2 class="t-heading">{t("stats.longevity.cemetery")}</h2>
        {data.cemetery.length === 0 ? (
          <p class="mp-field__hint">{t("stats.longevity.cemeteryEmpty")}</p>
        ) : (
          <ol class="mp-board">
            {data.cemetery.map((r) => (
              <li key={r.id}>
                <a class="mp-board__row" href={`/s/${r.id}`}>
                  <span />
                  {r.country_code ? <Flag code={r.country_code} /> : <span />}
                  <span class="mp-board__name">{[typeName(r.types), r.place_name].filter(Boolean).join(" · ")}<small style={{ display: "block", color: "var(--ink-muted)" }}>{r.died_at ? formatDate(r.died_at, l) : ""}</small></span>
                  <span class="mp-board__count">{formatDays(r.days, l)}</span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
