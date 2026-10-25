import { useMemo } from "preact/hooks";
import { AppMenu } from "../components/AppMenu";
import { Avatar } from "../components/Avatar";
import { InstagramLink } from "../components/InstagramHandle";
import { EmptyState } from "../components/EmptyState";
import { MiniSpotsMap } from "../components/MiniSpotsMap";
import { Shell } from "../components/Shell";
import { formatDate, formatNumber } from "../lib/format";
import { lang, t } from "../lib/i18n";
import { config, people, spots } from "../lib/store";
import { wrappedOpen } from "../lib/wrapped";

/** /p/:name: counts as stickers, a mini map with the exact points and a photo grid (Page09Profile). */
export default function ProfilePage({ name }: { name: string }) {
  const features = spots.value?.features ?? [];
  const person = people.value.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const shownName = person?.name ?? name;

  const { placed, reported, countries, since, grid, allSpots } = useMemo(() => {
    const lower = shownName.toLowerCase();
    const placed = features.filter((f) => f.properties.placers.some((p) => p.toLowerCase() === lower));
    const reported = features.filter((f) => f.properties.reporter?.toLowerCase() === lower);
    const both = [...new Map([...placed, ...reported].map((f) => [f.id, f])).values()];
    const sorted = [...both].sort((a, b) => b.properties.created_at.localeCompare(a.properties.created_at));
    const earliest = both.map((f) => f.properties.created_at).sort()[0];
    return {
      placed, reported, since: earliest, allSpots: both,
      countries: new Set(both.map((f) => f.properties.country_code).filter(Boolean)).size,
      grid: sorted.filter((f) => f.properties.thumb).slice(0, 60),
    };
  }, [features, shownName]);

  const rank = [...people.value].sort((a, b) => b.reported - a.reported).findIndex((p) => p.name === person?.name) + 1;
  const found = features.length === 0 || placed.length > 0 || reported.length > 0;

  return (
    <Shell active="stats" search={<></>} menu={<AppMenu />} mobileHeader={null}>
      <div class="page">
        {!found ? (
          <EmptyState icon="user" title={t("profile.notFound")} action={{ label: t("profile.back"), href: "/stats" }} />
        ) : (
          <div class="profile">
            <Avatar name={shownName} size="lg" decorative={false} />
            <div style={{ textAlign: "center" }}>
              <h1 class="t-display">{shownName}</h1>
              <span class="mp-field__hint">
                {since ? t("profile.since", { date: formatDate(since, lang.value) }) : ""}
                {rank > 0 && reported.length > 0 ? ` · ${t("profile.rank", { n: rank })}` : ""}
              </span>
            </div>
            {person?.instagram && config.value?.features.instagram === true && <InstagramLink handle={person.instagram} button />}
            {config.value?.features.globe_wrapped === true && wrappedOpen(new Date().getUTCFullYear(), Date.now(), config.value.wrapped_preview === true) && (
              <a class="mp-btn mp-btn--secondary" href={`/wrapped/${new Date().getUTCFullYear()}/${encodeURIComponent(shownName)}`}>{t("wrapped.openMine", { year: new Date().getUTCFullYear() })}</a>
            )}
            <div class="profile__stats">
              {[
                { n: placed.length, label: t("profile.placed"), tone: "", tilt: 2 },
                { n: reported.length, label: t("profile.reported"), tone: " mp-stat--brand", tilt: 3 },
                { n: countries, label: t("profile.countries"), tone: " mp-stat--butter", tilt: 4 },
              ].map((s) => (
                <div key={s.label} class={`mp-stat${s.tone}`} style={{ "--tilt": `var(--tilt-${s.tilt})`, padding: "10px 6px" }}>
                  <span class="mp-stat__num" style={{ fontSize: 34, lineHeight: "36px" }}>{formatNumber(s.n)}</span>
                  <span class="mp-stat__label">{s.label}</span>
                </div>
              ))}
            </div>
            <MiniSpotsMap
              label={shownName}
              href="/"
              points={allSpots.map((f) => ({ id: f.id, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }))}
            />
            <div class="profile__grid">
              {grid.map((f) => (
                <a key={f.id} href={`/s/${f.id}`} style={{ transform: `rotate(var(--tilt-${(Number.parseInt(f.id.slice(-2), 36) % 4) + 1}))` }}>
                  <img src={f.properties.thumb!} alt="" loading="lazy" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
