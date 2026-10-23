import { useEffect, useState } from "preact/hooks";
import { AppHeader } from "../components/AppHeader";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Polaroid, TypeSticker } from "../components/Polaroid";
import { lastCreated } from "../add/created";
import { AddStyles } from "../add/styles";
import { api } from "../lib/api";
import { formatCoords, formatRemaining } from "../lib/format";
import { t } from "../lib/i18n";
import { editGrants } from "../lib/local";
import { isDesktop } from "../lib/media";
import { toast } from "../lib/toast";
import { typeBySlug } from "../lib/store";
import type { SpotDetail } from "../shared/types";

const RAYS = Array.from({ length: 12 }, (_, i) => i * 30);

/** `/gracias/:id`: the chosen sticker slaps in (a fade with reduced motion), no confetti (design README, Motion). */
export default function ThanksPage({ id }: { id: string }) {
  const created = lastCreated.value?.id === id ? lastCreated.value : null;
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const desktop = isDesktop.value;

  useEffect(() => {
    let alive = true;
    api.spot(id).then((s) => { if (alive) setSpot(s); }).catch(() => undefined);
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const slugs = created?.types ?? spot?.types ?? [];
  const types = slugs.map((slug) => {
    const type = typeBySlug.value.get(slug);
    return { slug, label: type?.label ?? slug, icon: type?.icon ?? `/img/icons/${slug}.png`, fit: type?.fit };
  });
  const lead = types[0] ?? { slug: "papa", label: "Papa", icon: "/img/icons/papa.png", fit: "contain" as const };
  const size = types.length <= 1 ? 180 : types.length <= 3 ? 116 : 84;
  const photo = created?.photoUrl ?? spot?.thumb ?? null;
  const lat = spot?.lat ?? created?.lat;
  const lng = spot?.lng ?? created?.lng;
  const place = spot?.place_name || spot?.city || (lat !== undefined && lng !== undefined ? formatCoords(lat, lng) : "");
  const remaining = editGrants.remainingMs(`spot:${id}`) - (Date.now() - now);

  async function share() {
    const url = `${location.origin}/s/${id}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: t("app.name"), text: t("add.thanks.shareText"), url });
        return;
      }
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ message: t("add.thanks.copied"), kind: "success" });
    } catch {
      toast.show({ message: url, durationMs: 8000 });
    }
  }

  return (
    <div class="thanks">
      <AddStyles />
      {desktop && <AppHeader variant="desktop" active="map" search={<></>} />}
      <section class="thanks__hero" aria-hidden="false">
        <div class="thanks__rays" aria-hidden="true">
          {RAYS.map((deg) => <i key={deg} style={{ transform: `rotate(${deg}deg) translateY(-${size / 2 + 40}px)` }} />)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-4)", padding: "var(--space-8) var(--space-4)", position: "relative", zIndex: 1 }}>
          {types.length === 0 ? (
            <TypeSticker type={lead} size={size} class="thanks__sticker" />
          ) : (
            types.map((type, i) => (
              <span key={type.slug} class="thanks__sticker-wrap" style={{ animationDelay: `${i * 120}ms` }}>
                <TypeSticker type={type} size={size} class="thanks__sticker" />
              </span>
            ))
          )}
        </div>
      </section>
      <main class="thanks__body">
        <h1 class="thanks__title">{t("thanks.title")}</h1>
        <p class="thanks__line">{t("thanks.line")}</p>
        {photo && (
          <div class="thanks__polaroid">
            <Polaroid
              href={`/s/${id}`}
              index={0}
              types={types.length ? types : [lead]}
              photoSrc={photo}
              ratio="4/5"
              place={place || t("add.thanks.newSpot")}
              placer={spot?.placers.join(", ") || null}
            />
          </div>
        )}
        <div class="thanks__actions">
          <a class="mp-btn mp-btn--primary mp-btn--lg" href={`/s/${id}`}>{t("add.thanks.view")}</a>
          <div class="thanks__row">
            <a class="mp-btn mp-btn--secondary" href="/nuevo">{t("add.thanks.another")}</a>
            <Button variant="secondary" icon="share" onClick={() => void share()}>{t("action.share")}</Button>
          </div>
        </div>
        {remaining > 0 && (
          <Banner kind="countdown">
            {t("add.thanks.editFor")} <b>{formatRemaining(remaining)}</b>
          </Banner>
        )}
        {remaining > 0 && (
          <a class="mp-btn mp-btn--quiet mp-btn--sm" href={`/editar/${id}`}>
            <Icon name="pencil" size="sm" />
            {t("add.thanks.edit")}
          </a>
        )}
      </main>
    </div>
  );
}
