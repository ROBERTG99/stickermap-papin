import { useMemo } from "preact/hooks";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { Icon } from "../../components/Icon";
import { formatNumber } from "../../lib/format";
import { t } from "../../lib/i18n";
import { stopsFor, routeKm } from "../../map/routes";
import { allFeatures, MAX_ROUTES, routePeople } from "./state";

/** Who is drawn, with a key that says name, stops and km (the dash pattern in the key matches the line on the map). */
export function RoutesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const features = allFeatures.value;
  const chosen = routePeople.value;
  const people = useMemo(() => {
    const count = new Map<string, number>();
    for (const f of features) for (const p of f.properties.placers) count.set(p, (count.get(p) ?? 0) + 1);
    return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16).map(([name]) => name);
  }, [features]);

  const toggle = (name: string) => {
    if (chosen.includes(name)) routePeople.value = chosen.filter((n) => n !== name);
    else if (chosen.length < MAX_ROUTES) routePeople.value = [...chosen, name];
  };

  return (
    <Dialog
      open={open}
      title={t("map.globe.routesTitle")}
      onClose={onClose}
      layout="sheet"
      actions={
        <>
          <Button variant="primary" onClick={onClose}>{t("map.globe.routesDone")}</Button>
          {chosen.length > 0 && <Button variant="quiet" onClick={() => { routePeople.value = []; }}>{t("map.globe.routesClear")}</Button>}
        </>
      }
    >
      <div class="mp-field">
        <span class="mp-field__label">{t("map.globe.routesWho", { max: MAX_ROUTES })}</span>
        <div class="mp-chips">
          {people.map((name) => {
            const on = chosen.includes(name);
            return (
              <button key={name} type="button" class="mp-chip" aria-pressed={on} disabled={!on && chosen.length >= MAX_ROUTES} onClick={() => toggle(name)}>
                <Avatar name={name} size={24} />
                {name}
                {on && <span class="mp-chip__tick"><Icon name="check" /></span>}
              </button>
            );
          })}
        </div>
        {chosen.length >= MAX_ROUTES && <span class="mp-field__hint">{t("map.globe.routesMax", { max: MAX_ROUTES })}</span>}
      </div>
      {chosen.length > 0 && (
        <div class="mp-routekey" style={{ marginTop: "var(--space-3)" }}>
          {chosen.map((name, i) => {
            const stops = stopsFor(features, name);
            const km = formatNumber(Math.round(routeKm(stops)));
            return (
              <span key={name} class="mp-routekey__row">
                <svg viewBox="0 0 34 10" aria-hidden="true"><path class="mp-route mp-route--casing" d="M2 5H32" /><path class={`mp-route mp-route--${i + 1}`} d="M2 5H32" /></svg>
                {t(stops.length === 1 ? "map.globe.routesKeyOne" : "map.globe.routesKey", { name, stops: stops.length, km })}
              </span>
            );
          })}
        </div>
      )}
      <p class="mp-field__hint">{t("map.globe.routesHint")}</p>
    </Dialog>
  );
}
