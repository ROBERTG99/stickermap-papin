import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AppMenu } from "../components/AppMenu";
import { Avatar } from "../components/Avatar";
import { EmptyState } from "../components/EmptyState";
import { Polaroid } from "../components/Polaroid";
import { Shell } from "../components/Shell";
import { GallerySkeleton } from "../components/Skeleton";
import { TypeSticker } from "../components/Polaroid";
import { formatNumber } from "../lib/format";
import { t } from "../lib/i18n";
import { config, people, spots, spotsStatus, typeBySlug, types } from "../lib/store";

const PAGE = 40;
const RATIOS = ["4/5", "1/1", "3/4", "5/4", "4/5", "5/6"] as const;

/** /galeria: every spot as a tilted polaroid, newest first, filterable by type and person (Page06Gallery). */
export default function GalleryPage() {
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set());
  const [activePeople, setActivePeople] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const features = spots.value?.features ?? [];
  const sorted = useMemo(() => [...features].sort((a, b) => b.properties.created_at.localeCompare(a.properties.created_at)), [features]);
  const filtered = useMemo(
    () => sorted.filter((f) => {
      const p = f.properties;
      if (activeTypes.size && !p.types.some((x) => activeTypes.has(x))) return false;
      if (activePeople.size && !p.placers.some((x) => activePeople.has(x))) return false;
      return true;
    }),
    [sorted, activeTypes, activePeople],
  );

  useEffect(() => setVisible(PAGE), [activeTypes, activePeople]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const toggle = (set: Set<string>, value: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    apply(next);
  };
  const topPeople = people.value.filter((p) => p.placed > 0).slice(0, 8);
  const activeCount = activeTypes.size + activePeople.size;
  const loading = spotsStatus.value === "loading" && features.length === 0;

  return (
    <Shell active="gallery" search={<></>} filterCount={activeCount} menu={<AppMenu />} mobileHeader={null}>
      <div class="page">
        <div class="page__head">
          <h1 class="t-title" style={{ fontSize: "28px" }}>{t("gallery.title")}</h1>
          <span class="mp-field__hint">{t("gallery.count", { n: formatNumber(filtered.length) })} · {t("gallery.newest")}</span>
          <div class="mp-chips mp-chips--scroll" role="group" aria-label={t("gallery.filters")}>
            {types.value.map((ty) => (
              <button key={ty.slug} type="button" class="mp-chip" aria-pressed={activeTypes.has(ty.slug)} onClick={() => toggle(activeTypes, ty.slug, setActiveTypes)}>
                <TypeSticker type={ty} size={28} />
                {ty.label}
                <span class="mp-chip__count">{ty.count ?? 0}</span>
              </button>
            ))}
            {topPeople.map((p) => (
              <button key={p.name} type="button" class="mp-chip" aria-pressed={activePeople.has(p.name)} onClick={() => toggle(activePeople, p.name, setActivePeople)}>
                <Avatar name={p.name} size={24} />
                {p.name}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <GallerySkeleton count={6} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="gallery" title={t("gallery.empty")} action={{ label: t("common.action.clear"), onClick: () => { setActiveTypes(new Set()); setActivePeople(new Set()); } }} />
        ) : (
          <div class="gal">
            {filtered.slice(0, visible).map((f, i) => {
              const p = f.properties;
              return (
                <Polaroid
                  key={f.id}
                  href={`/s/${f.id}`}
                  index={i}
                  ratio={RATIOS[i % RATIOS.length]}
                  types={p.types.flatMap((s) => { const ty = typeBySlug.value.get(s); return ty ? [ty] : []; })}
                  photoSrc={p.thumb}
                  videoSrc={p.v && config.value?.features.video ? `/media/video/${f.id}.${p.v}` : null}
                  place={p.place_name ?? p.country ?? "—"}
                  placer={p.placers.join(", ") || null}
                />
              );
            })}
          </div>
        )}
        {filtered.length > visible && (
          <div ref={sentinel} class="mp-field__hint" style={{ textAlign: "center", padding: "var(--space-4)" }}>
            <span class="mp-spinner" /> {t("gallery.more")}
          </div>
        )}
      </div>
    </Shell>
  );
}
