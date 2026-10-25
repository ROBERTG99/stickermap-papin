import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AppHeader } from "../components/AppHeader";
import { AppMenu } from "../components/AppMenu";
import { Banner, FirstVisitHint } from "../components/Banner";
import { BottomSheet, type SheetSnap } from "../components/BottomSheet";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { Legend } from "../components/Legend";
import { MapAttribution, MapControls } from "../components/MapControls";
import { Shell } from "../components/Shell";
import { SidePanel } from "../components/SidePanel";
import { Skeleton, SpotSkeleton } from "../components/Skeleton";
import { bulkReminder } from "../lib/drafts";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { storage } from "../lib/local";
import { isDesktop, prefersReducedMotion } from "../lib/media";
import { navigate } from "../lib/router";
import { config, loadSpots, online, spotById, spotsStatus, theme, typeBySlug, types } from "../lib/store";
import { toast } from "../lib/toast";
import { StickerMap, loadSavedView, saveView } from "../map/map";
import { selectionPadding, type SelectionLayout } from "../map/layout";
import { stepSpot } from "../map/filters";
import { type PlaceResult } from "../map/search";
import { featureToDetail } from "../map/spot-view";
import { DEFAULT_STYLE_URL, loadStyle } from "../map/style";
import type { SpotDetail } from "../shared/types";
import { FilterFooter, FilterSections } from "./map/Filters";
import { PhotoViewer } from "./map/PhotoViewer";
import { PlaceSearchBox } from "./map/PlaceSearchBox";
import { ReportDialog, type ReportTarget } from "./map/ReportDialog";
import { SpotBody } from "./map/SpotBody";
import { useSpotDetail } from "./map/detail";
import { activeCount, allFeatures, clearFilters, facets, filteredFeatures, filters, legendPref, setFilters, setLegendCollapsed } from "./map/state";
import "./map/map.css";

const FALLBACK_HEADER_BOTTOM = 124;

/** Light / dark as the map style needs it (the style is retinted from the live `map-*` tokens). */
function useResolvedScheme(): "light" | "dark" {
  const mq = useMemo(() => matchMedia("(prefers-color-scheme: dark)"), []);
  const [systemDark, setSystemDark] = useState(mq.matches);
  useEffect(() => {
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mq]);
  const choice = theme.value;
  return choice === "auto" ? (systemDark ? "dark" : "light") : choice;
}

/** `/` and `/s/:id`: the map, its sheet / panel, the lightbox and the filters. */
export default function MapPage({ spotId }: { spotId?: string }) {
  const desktop = isDesktop.value;
  const reduceMotion = prefersReducedMotion.value;
  const canvasRef = useRef<HTMLDivElement>(null);
  const smRef = useRef<StickerMap | null>(null);
  const savedViewRef = useRef(loadSavedView());

  const [snap, setSnap] = useState<SheetSnap>("peek");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [satellite, setSatelliteOn] = useState(() => storage.get("satellite", false));
  const [locating, setLocating] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [hint, setHint] = useState(() => !storage.get("hintSeen", false));

  const all = allFeatures.value;
  const filtered = filteredFeatures.value;
  const counts = facets.value;
  const status = spotsStatus.value;
  const offline = status === "offline" || !online.value;
  const loading = status === "loading";

  // ── the selected spot ───────────────────────────────────────────────────
  const feature = spotId ? spotById.value.get(spotId) : undefined;
  const fetched = useSpotDetail(spotId);
  const detail: SpotDetail | null = spotId ? (fetched.detail ?? (feature ? featureToDetail(feature) : null)) : null;
  const missing = Boolean(spotId) && fetched.status === "missing";
  const unavailable = Boolean(spotId) && !detail && (fetched.status === "offline" || fetched.status === "error");
  const sheetOpen = Boolean(spotId) && !missing && !unavailable;
  const lastDetail = useRef<SpotDetail | null>(null);
  if (detail) lastDetail.current = detail;
  const shown = detail ?? lastDetail.current;
  const expanded = !desktop && sheetOpen && snap === "expanded";

  const intentRef = useRef<"marker" | "nav">("nav");
  const lastFocusRef = useRef<string | undefined>(undefined);
  const firstFocusRef = useRef(true);

  const select = (id: string, via: "marker" | "nav" = "marker") => {
    intentRef.current = via;
    if (id !== spotId) navigate(`/s/${id}`, { replace: Boolean(spotId) });
  };
  const close = () => {
    setPhotoFor(null);
    navigate("/");
  };
  const dismissHint = () => {
    storage.set("hintSeen", true);
    setHint(false);
  };
  // The map is created once; its callbacks always call the latest closures.
  const live = useRef({ select, close, dismissHint });
  live.current = { select, close, dismissHint };

  useEffect(() => setSnap("peek"), [spotId]);

  // ── the map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const sm = new StickerMap(
      el,
      {
        onSpotClick: (id) => {
          live.current.dismissHint();
          live.current.select(id, "marker");
        },
        onBackgroundClick: () => {
          live.current.dismissHint();
          if (location.pathname.startsWith("/s/")) live.current.close();
        },
        onViewChange: saveView,
      },
      savedViewRef.current,
    );
    smRef.current = sm;
    return () => {
      sm.destroy();
      smRef.current = null;
    };
  }, []);

  useEffect(() => {
    smRef.current?.setSatellite(satellite);
    storage.set("satellite", satellite);
  }, [satellite]);

  // Retinted style: reload when the style URL or the light / dark scheme changes. Offline keeps the empty land background.
  const styleUrl = config.value?.map_style_url ?? DEFAULT_STYLE_URL;
  const scheme = useResolvedScheme();
  const styleRequest = useRef(0);
  useEffect(() => {
    const sm = smRef.current;
    if (!sm) return;
    const request = ++styleRequest.current;
    loadStyle(styleUrl)
      .then((spec) => {
        if (request === styleRequest.current) sm.applyStyle(spec);
      })
      .catch(() => {
        if (request === styleRequest.current) sm.applyStyle(null);
      });
  }, [styleUrl, scheme]);

  useEffect(() => {
    smRef.current?.setAllSpots(all);
  }, [all]);
  useEffect(() => {
    smRef.current?.setData(filtered);
  }, [filtered]);
  const bySlug = typeBySlug.value;
  useEffect(() => {
    smRef.current?.setTypes(bySlug);
  }, [bySlug]);

  const headerBottom = () => {
    const header = document.querySelector<HTMLElement>(".map-header");
    return header && header.offsetParent ? header.getBoundingClientRect().bottom : FALLBACK_HEADER_BOTTOM;
  };

  // First open without a remembered viewport: frame every spot.
  const fittedRef = useRef(false);
  useEffect(() => {
    const sm = smRef.current;
    if (!sm || fittedRef.current || all.length === 0) return;
    fittedRef.current = true;
    if (savedViewRef.current || spotId) return;
    sm.fitToSpots(all, { top: desktop ? 0 : headerBottom(), right: 0, bottom: 0, left: 0 });
  }, [all.length]);

  // Selection: grow the marker, keep the dot clear of the sheet / panel, ease the camera there.
  const coordKey = detail ? `${detail.lng},${detail.lat}` : "";
  useEffect(() => {
    const sm = smRef.current;
    const container = canvasRef.current;
    if (!sm || !container) return;
    if (!spotId || !sheetOpen) {
      sm.setSelected(null);
      sm.clearPadding(!reduceMotion);
      lastFocusRef.current = undefined;
      return;
    }
    sm.setSelected(spotId);
    if (!detail) return;
    const layout: SelectionLayout = {
      desktop,
      mapHeight: container.clientHeight,
      viewportHeight: window.innerHeight,
      snap,
      headerBottom: headerBottom(),
      drawerOpen: desktop && filtersOpen,
    };
    const fresh = lastFocusRef.current !== spotId;
    const first = firstFocusRef.current;
    let zoom: number | undefined;
    if (fresh && (first || intentRef.current === "nav")) zoom = first ? 15 : Math.max(sm.map.getZoom(), 13);
    sm.focus([detail.lng, detail.lat], { padding: selectionPadding(layout), zoom, animate: !reduceMotion && !first });
    lastFocusRef.current = spotId;
    firstFocusRef.current = false;
    intentRef.current = "nav";
  }, [spotId, sheetOpen, coordKey, desktop, snap, filtersOpen]);

  // Esc closes the desktop filter drawer (the mobile sheet handles its own Esc).
  useEffect(() => {
    if (!filtersOpen || !desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !(e.target instanceof HTMLInputElement && e.target.value)) setFiltersOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtersOpen, desktop]);

  // ── actions ─────────────────────────────────────────────────────────────
  const flyToPlace = (place: PlaceResult) => smRef.current?.flyToPlace(place, !reduceMotion);

  const locate = () => {
    if (!navigator.geolocation) {
      toast.show({ message: t("map.locate.failed"), kind: "error" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        smRef.current?.showMe([pos.coords.longitude, pos.coords.latitude], !reduceMotion);
      },
      () => {
        setLocating(false);
        toast.show({ message: t("map.locate.failed"), kind: "error" });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const onLegendType = (slug: string) => {
    const previous = filters.value;
    if (previous.types.length === 1 && previous.types[0] === slug) {
      setFilters({ ...previous, types: [] });
      return;
    }
    setFilters({ ...previous, types: [slug] });
    const label = types.value.find((tp) => tp.slug === slug)?.label ?? slug;
    toast.show({ message: t("map.legend.only", { type: label }), action: { label: t("common.action.undo"), onClick: () => setFilters(previous) } });
  };

  const step = (dir: 1 | -1) => {
    const next = spotId ? stepSpot(filtered, spotId, dir) : null;
    if (next) select(next, "nav");
  };

  // ── chrome ──────────────────────────────────────────────────────────────
  const searchEl = <PlaceSearchBox onPick={flyToPlace} />;
  const menuEl = <AppMenu />;
  const toggleFilters = () => setFiltersOpen((open) => !open);
  const legendTypes = types.value.map((tp) => ({ ...tp, count: counts.types.get(tp.slug) ?? 0 }));
  const activeType = filters.value.types.length === 1 ? (filters.value.types[0] ?? null) : null;
  const legendCollapsed = legendPref.value ?? !(desktop && sheetOpen);
  const mobileModalOpen = !desktop && (sheetOpen || filtersOpen);
  const reminder = bulkReminder.value;
  const panelOpen = desktop && sheetOpen;
  const drawerOpen = desktop && filtersOpen;
  const empty = status === "ready" && !spotId && filtered.length === 0;
  const legendOpen = !legendCollapsed && !mobileModalOpen && !loading;

  const header = (
    <AppHeader
      variant="floating"
      class={cx("map-header", expanded && "is-hidden")}
      search={searchEl}
      menu={menuEl}
      filterCount={activeCount.value}
      onFilters={toggleFilters}
    />
  );

  const spotBody = (variant: "peek" | "full") =>
    shown ? (
      <SpotBody
        detail={shown}
        variant={variant}
        onOpenPhoto={() => setPhotoFor(shown.id)}
        onReport={() => setReport({ id: shown.id })}
      />
    ) : (
      <SpotSkeleton />
    );
  const placeTitle = shown?.place_name ?? shown?.city ?? t("map.spot.unnamed");

  return (
    <>
      <Shell active="map" mobileHeader={header} search={searchEl} menu={menuEl} filterCount={activeCount.value} onFilters={toggleFilters} fab={!mobileModalOpen}>
        <div
          class={cx(
            "map-page",
            panelOpen && "map-page--panel",
            drawerOpen && "map-page--drawer",
            !desktop && sheetOpen && (snap === "expanded" ? "map-page--sheet-expanded" : "map-page--sheet-peek"),
            legendOpen && "map-page--legend-open",
          )}
        >
          <div class="map-canvas" ref={canvasRef} />

          <div class="map-stack">
            {offline && (
              <Banner kind="offline" action={{ label: t("common.action.retry"), onClick: () => void loadSpots() }}>
                {t("map.banner.offline")}
              </Banner>
            )}
            {reminder.unfinished ? (
              <Banner kind="info" icon="upload" class="mp-banner--resume" action={{ label: t("map.banner.continue"), onClick: () => navigate("/nuevo/varias") }}>
                {t("map.banner.unfinished", { done: reminder.unfinished.done, total: reminder.unfinished.total })}
              </Banner>
            ) : (
              reminder.unplaced > 0 && (
                <Banner kind="info" icon="pin" class="mp-banner--resume" action={{ label: t("map.banner.place"), onClick: () => navigate("/nuevo/varias") }}>
                  {t(reminder.unplaced === 1 ? "map.banner.unplacedOne" : "map.banner.unplaced", { n: reminder.unplaced })}
                </Banner>
              )
            )}
            <MapControls
              satellite={satellite}
              onToggleSatellite={() => setSatelliteOn((on) => !on)}
              onZoomIn={() => smRef.current?.zoomBy(1)}
              onZoomOut={() => smRef.current?.zoomBy(-1)}
              onLocate={locate}
              locating={locating}
            />
          </div>

          {loading && (
            <span class="mp-badge map-loading" role="status">
              <span class="mp-spinner" aria-hidden="true" />
              {t("map.loading")}
            </span>
          )}

          {!mobileModalOpen &&
            (loading ? (
              <div class="mp-legend mp-legend--collapsed map-legend map-legend--skeleton" aria-hidden="true">
                <Skeleton radius={12} class="map-legend__skel" />
              </div>
            ) : (
              types.value.length > 0 && (
              <Legend
                class="map-legend"
                types={legendTypes}
                activeType={activeType}
                onToggleType={onLegendType}
                collapsed={legendCollapsed}
                onCollapsedChange={setLegendCollapsed}
              />
              )
            ))}

          <MapAttribution satellite={satellite} class="map-attrib" />

          {hint && !loading && !offline && !empty && all.length > 0 && !spotId && !filtersOpen && <FirstVisitHint class="map-hint" onDismiss={dismissHint} />}

          {empty && (
            <div class="map-center">
              {all.length > 0 ? (
                <EmptyState card icon="/img/icons/papa.png" title={t("common.empty.filter")} body={t("map.empty.body")} action={{ label: t("common.action.clear"), onClick: clearFilters }} />
              ) : (
                <EmptyState card icon="/img/icons/papa.png" title={t("common.empty.filter")} body={t("map.empty.none")} action={{ label: t("map.empty.add"), href: "/nuevo" }} />
              )}
            </div>
          )}

          {(missing || unavailable) && (
            <div class="map-center">
              <EmptyState
                card
                icon="/img/icons/papa.png"
                title={t("common.empty.notFound")}
                body={t(missing ? "map.notFound.body" : "map.notFound.offline")}
                action={{ label: t("map.notFound.back"), href: "/" }}
              />
            </div>
          )}

          {drawerOpen && (
            <aside class="mp-panel map-drawer" aria-label={t("map.filters.title")}>
              <div class="mp-panel__head">
                <h2 class="mp-sheet__title">{t("map.filters.title")}</h2>
                <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label={t("map.filters.close")} onClick={() => setFiltersOpen(false)}>
                  <Icon name="x" />
                </button>
              </div>
              <div class="mp-panel__body map-filters__body map-drawer__body">
                <FilterSections />
              </div>
              <div class="map-drawer__foot">
                <FilterFooter activeCount={activeCount.value} onDone={() => setFiltersOpen(false)} />
              </div>
            </aside>
          )}
        </div>
      </Shell>

      <div class="map-layer" data-layout={desktop ? "desktop" : "mobile"}>
        {desktop ? (
          sheetOpen && (
            <SidePanel title={placeTitle} onClose={close} onPrev={() => step(-1)} onNext={() => step(1)}>
              {spotBody("full")}
            </SidePanel>
          )
        ) : (
          <>
            <BottomSheet class="map-sheet" open={sheetOpen} snap={snap} onSnapChange={setSnap} onClose={close} title={placeTitle}>
              {spotBody(snap === "expanded" ? "full" : "peek")}
            </BottomSheet>
            <BottomSheet
              class="map-sheet map-sheet--filters"
              open={filtersOpen}
              snap="expanded"
              modal
              aboveTabBar={false}
              onSnapChange={() => setFiltersOpen(false)}
              onClose={() => setFiltersOpen(false)}
              title={t("map.filters.title")}
            >
              <div class="map-filters">
                <div class="mp-sheet__head">
                  <h2 class="mp-sheet__title">{t("map.filters.title")}</h2>
                  <button type="button" class="mp-btn mp-btn--quiet mp-btn--icon" aria-label={t("map.filters.close")} onClick={() => setFiltersOpen(false)}>
                    <Icon name="x" />
                  </button>
                </div>
                <div class="map-filters__body">
                  <FilterSections />
                </div>
                <div class="map-filters__foot">
                  <FilterFooter activeCount={activeCount.value} onDone={() => setFiltersOpen(false)} />
                </div>
              </div>
            </BottomSheet>
          </>
        )}
      </div>

      {photoFor && (
        <PhotoViewer
          startId={photoFor}
          features={filtered}
          all={spotById.value}
          onClose={(lastId) => {
            setPhotoFor(null);
            if (lastId !== spotId) select(lastId, "nav");
          }}
        />
      )}

      <ReportDialog target={report} onClose={() => setReport(null)} />
    </>
  );
}
