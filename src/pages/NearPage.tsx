import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AppMenu } from "../components/AppMenu";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { SightingSheet } from "../components/SightingSheet";
import { Shell } from "../components/Shell";
import { TypeSticker } from "../components/Polaroid";
import { formatKm } from "../lib/format";
import { t } from "../lib/i18n";
import { spots, typeBySlug } from "../lib/store";
import { bearingDegrees, compassName, haversineMeters } from "../shared/geo";
import { NEAR_RADIUS_M } from "../shared/life";
import type { SpotFeature } from "../shared/types";
import { refreshSpotDetail } from "./map/detail";

const LIMIT = 10;

interface Fix { lat: number; lng: number }
interface Row { f: SpotFeature; dist: number; bearing: number }

const distText = (m: number) => (m < 1000 ? `${Math.round(m)} m` : formatKm(m));

/** `webkitCompassHeading` on iOS, the absolute alpha elsewhere; null when the device has no compass. */
function headingOf(e: DeviceOrientationEvent): number | null {
  const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof ios === "number") return ios;
  if (e.absolute && typeof e.alpha === "number") return (360 - e.alpha) % 360;
  return null;
}

/** /cerca (F4): the ten nearest stickers while the app is open, with distance, a direction arrow and a nudge to check on one you stand next to. */
export default function NearPage() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [state, setState] = useState<"idle" | "finding" | "denied" | "failed">("idle");
  const [heading, setHeading] = useState<number | null>(null);
  const [compass, setCompass] = useState<"off" | "on">("off");
  const [checking, setChecking] = useState<Row | null>(null);
  const watch = useRef<number | null>(null);

  const start = () => {
    if (!("geolocation" in navigator)) { setState("failed"); return; }
    setState("finding");
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = navigator.geolocation.watchPosition(
      (p) => { setFix({ lat: p.coords.latitude, lng: p.coords.longitude }); setState("idle"); },
      (e) => setState(e.code === e.PERMISSION_DENIED ? "denied" : "failed"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  };

  useEffect(() => {
    // already allowed: start by itself; otherwise wait for the tap (the browser asks then)
    void navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => { if (p.state === "granted") start(); }).catch(() => undefined);
    return () => { if (watch.current !== null) navigator.geolocation.clearWatch(watch.current); };
  }, []);

  useEffect(() => {
    if (compass !== "on") return;
    const handler = (e: Event) => setHeading(headingOf(e as DeviceOrientationEvent));
    const event = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(event, handler);
    return () => window.removeEventListener(event, handler);
  }, [compass]);

  async function enableCompass() {
    const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
    try {
      if (typeof D.requestPermission === "function" && (await D.requestPermission()) !== "granted") return;
      setCompass("on");
    } catch {
      /* no compass on this device */
    }
  }

  const rows = useMemo<Row[]>(() => {
    if (!fix) return [];
    return (spots.value?.features ?? [])
      .filter((f) => f.properties.life !== "dead")
      .map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        return { f, dist: haversineMeters(fix.lat, fix.lng, lat, lng), bearing: bearingDegrees(fix.lat, fix.lng, lat, lng) };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, LIMIT);
  }, [fix, spots.value]);

  const closest = rows[0] && rows[0].dist <= NEAR_RADIUS_M ? rows[0] : null;

  return (
    <Shell active="near" search={<></>} menu={<AppMenu />} mobileHeader={null}>
      <div class="page">
        <div class="page__head">
          <h1 class="t-title" style={{ fontSize: "28px" }}>{t("near.title")}</h1>
          <span class="mp-field__hint">{t("near.intro")}</span>
        </div>
        <div class="page__body" style={{ display: "grid", gap: "var(--space-4)" }}>
          {!fix && (
            <div style={{ display: "grid", gap: "var(--space-3)", justifyItems: "start" }}>
              <Button variant="primary" icon="locate" loading={state === "finding"} onClick={start}>{t("near.start")}</Button>
              <span class="mp-field__hint">{state === "finding" ? t("near.finding") : t("near.why")}</span>
              {state === "denied" && <Banner kind="error" icon="alert">{t("near.denied")}</Banner>}
              {state === "failed" && <Banner kind="error" icon="alert">{t("near.failed")}</Banner>}
            </div>
          )}
          {closest && (() => {
            const first = typeBySlug.value.get(closest.f.properties.types[0] ?? "");
            return (
              <div class="mp-near" role="status">
                <span class="mp-near__pulse">{first ? <TypeSticker type={first} size={48} /> : null}</span>
                <div>
                  <b style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>{t("near.nearTitle")}</b>
                  <br />
                  <span style={{ fontSize: 14 }}>{t("near.nearBy", { type: first?.label ?? "Sticker", name: closest.f.properties.placers[0] ?? t("near.anyone"), dist: distText(closest.dist) })}</span>
                  <div style={{ marginTop: 8 }}>
                    <Button variant="primary" size="sm" icon="eye" onClick={() => setChecking(closest)}>{t("near.report")}</Button>
                  </div>
                </div>
              </div>
            );
          })()}
          {fix && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {compass === "off" ? (
                <>
                  <Button variant="quiet" size="sm" icon="compass" onClick={() => void enableCompass()}>{t("near.compass")}</Button>
                  <span class="mp-field__hint">{t("near.compassNote")}</span>
                </>
              ) : (
                <span class="mp-src"><Icon name="compass" />{t("near.compassOn")}</span>
              )}
            </div>
          )}
          {fix && rows.length === 0 && <EmptyState icon="compass" title={t("near.empty")} />}
          {rows.length > 0 && (
            <ul class="mp-radar">
              {rows.map(({ f, dist, bearing }) => {
                const p = f.properties;
                const type = typeBySlug.value.get(p.types[0] ?? "");
                const turn = heading === null ? bearing : (bearing - heading + 360) % 360;
                return (
                  <li key={f.id}>
                    <a class="mp-radar__row" href={`/s/${f.id}`}>
                      {type ? <TypeSticker type={type} size={40} /> : <span />}
                      <span>
                        <span class="mp-radar__name">{p.place_name ?? t("near.unnamed")}</span>
                        <span class="mp-radar__meta">{[p.life === "unknown" ? t("components.marker.noNews") : t("components.life.alive"), p.placers[0]].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span class="mp-radar__dist">{distText(dist)}</span>
                      <span class="mp-arrow" style={{ "--bearing": `${Math.round(turn)}deg` }} role="img" aria-label={t(`near.direction.${compassName(turn)}`)}><Icon name="navigation" /></span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {checking && (
        <SightingSheet
          open
          via="radar"
          onClose={() => setChecking(null)}
          onDone={() => void refreshSpotDetail(checking.f.id)}
          spot={{ id: checking.f.id, lat: checking.f.geometry.coordinates[1], lng: checking.f.geometry.coordinates[0], place: checking.f.properties.place_name ?? t("near.unnamed") }}
        />
      )}
    </Shell>
  );
}
