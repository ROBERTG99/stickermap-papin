import { useEffect, useState } from "preact/hooks";
import { AppMenu } from "../components/AppMenu";
import { Banner } from "../components/Banner";
import { Flag } from "../components/Flag";
import { Leaderboard } from "../components/Leaderboard";
import { Segmented } from "../components/Segmented";
import { Shell } from "../components/Shell";
import { TypeCount } from "../components/StatSticker";
import { Skeleton } from "../components/Skeleton";
import { api, type StatsPayload } from "../lib/api";
import { formatNumber } from "../lib/format";
import { t } from "../lib/i18n";
import { lastPerson } from "../lib/local";
import { people, typeBySlug } from "../lib/store";

type Board = "placed" | "reported";

/** /stats: hero numbers as stickers, per-type counts, the two leaderboards, countries and the monthly timeline (Page07/08). */
export default function StatsPage() {
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [board, setBoard] = useState<Board>("placed");
  useEffect(() => { api.stats().then(setStats).catch(() => setFailed(true)); }, []);

  const me = lastPerson.get();
  const stickers = stats?.types.reduce((n, ty) => n + ty.count, 0) ?? 0;
  const max = Math.max(1, ...(stats?.types.map((ty) => ty.count) ?? [0]));
  const rows = (board === "placed" ? stats?.placers : stats?.reporters)?.map((r) => ({ name: r.name, count: r.count, isYou: !!me && r.name.toLowerCase() === me.toLowerCase() })) ?? [];
  const peak = Math.max(1, ...(stats?.months.map((m) => m.count) ?? [0]));

  return (
    <Shell active="stats" search={<></>} menu={<AppMenu />} mobileHeader={null}>
      <div class="page">
        <div class="page__head"><h1 class="t-title" style={{ fontSize: "28px" }}>{t("stats.title")}</h1></div>
        {failed && <Banner kind="error" action={{ label: t("common.action.retry"), onClick: () => { setFailed(false); api.stats().then(setStats).catch(() => setFailed(true)); } }}>{t("stats.loadError")}</Banner>}
        {!stats && !failed && <div class="page__body"><Skeleton variant="block" height={120} /><Skeleton variant="block" height={240} /></div>}
        {stats && (
          <div class="page__body">
            <div class="wide hero-grid">
              {[
                { n: stats.total_spots, label: t("stats.spots"), tone: "", tilt: 1 },
                { n: stickers, label: t("stats.stickers"), tone: " mp-stat--brand", tilt: 2 },
                { n: stats.total_countries, label: t("stats.countries"), tone: " mp-stat--butter", tilt: 3 },
                { n: people.value.length, label: t("stats.people"), tone: " mp-stat--peach", tilt: 4 },
              ].map((s) => (
                <div key={s.label} class={`mp-stat${s.tone}`} style={{ "--tilt": `var(--tilt-${s.tilt})` }}>
                  <span class="mp-stat__num">{formatNumber(s.n)}</span>
                  <span class="mp-stat__label">{s.label}</span>
                </div>
              ))}
            </div>
            <section style={{ display: "grid", gap: 12 }}>
              <h2 class="t-heading">{t("stats.byType")}</h2>
              <div>
                {stats.types.map((ty) => {
                  const ref = typeBySlug.value.get(ty.slug);
                  return ref ? <TypeCount key={ty.slug} type={{ ...ref, label: ty.label }} count={ty.count} max={max} /> : null;
                })}
              </div>
            </section>
            <section style={{ display: "grid", gap: 12 }}>
              <h2 class="t-heading">{t("stats.rankings")}</h2>
              <Segmented<Board> ariaLabel={t("stats.rankings")} value={board} onChange={setBoard}
                options={[{ value: "placed", label: t("stats.mostPlaced") }, { value: "reported", label: t("stats.mostReported") }]} />
              {rows.length === 0 && <p class="mp-field__hint">{t(board === "placed" ? "stats.noPlacers" : "stats.noReporters")}</p>}
              <Leaderboard rows={rows} limit={8} footnote={board === "placed" && stats.unknown_placers > 0 ? t("stats.orphans", { n: formatNumber(stats.unknown_placers) }) : undefined} />
            </section>
            <section style={{ display: "grid", gap: 12 }}>
              <h2 class="t-heading">{t("stats.countriesTitle")}</h2>
              <ol class="mp-board">
                {stats.countries.slice(0, 10).map((c, i) => (
                  <li key={c.code}>
                    <span class="mp-board__row">
                      <span class={`mp-medal mp-medal--${i < 3 ? i + 1 : "n"}`}>{i + 1}</span>
                      <Flag code={c.code} />
                      <span class="mp-board__name">{c.name}</span>
                      <span class="mp-board__count">{formatNumber(c.count)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section class="wide" style={{ display: "grid", gap: 12 }}>
              <h2 class="t-heading">{t("stats.timeline")}</h2>
              <div class="mp-bars" role="img" aria-label={t("stats.timeline")}>
                {stats.months.map((m) => (
                  <span key={m.month} class={`mp-bars__bar${m.count === 0 ? " mp-bars__bar--zero" : ""}`} style={{ "--h": `${Math.max(4, Math.round((m.count / peak) * 100))}%` }} title={`${m.month}: ${m.count}`} />
                ))}
              </div>
              <div class="mp-bars__axis"><span>{stats.months[0]?.month}</span><span>{stats.months.at(-1)?.month}</span></div>
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}
