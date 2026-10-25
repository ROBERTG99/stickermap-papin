import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Flag } from "../components/Flag";
import { Icon } from "../components/Icon";
import { TypeSticker } from "../components/Polaroid";
import { downloadBlob, shareImage } from "../lib/canvas-card";
import { t } from "../lib/i18n";
import { navigate } from "../lib/router";
import { config, spots, types } from "../lib/store";
import { toast } from "../lib/toast";
import { groupCards, personCards, type WrappedCard } from "../lib/wrapped-cards";
import { renderWrappedCard } from "../lib/wrapped-render";
import { groupYear, personYear, toWSpots, wrappedOpen } from "../lib/wrapped";
import { zipStored } from "../lib/zip";

const SLIDE_MS = 6500;

/** /wrapped/:year[/:person] (F5): a story deck. Tap right/left to move, hold to pause; every card exports at 1080×1920. */
export default function WrappedPage({ year, person }: { year: number; person?: string }) {
  const all = useMemo(() => toWSpots(spots.value?.features ?? []), [spots.value]);
  const enabled = config.value?.features.globe_wrapped === true;
  const open = enabled && wrappedOpen(year, Date.now(), config.value?.wrapped_preview === true);
  const cards: WrappedCard[] = useMemo(() => {
    if (!open || all.length === 0) return [];
    return person ? personCards(personYear(all, person, year), types.value) : groupCards(groupYear(all, year));
  }, [open, all, person, year, types.value]);
  const empty = cards.length > 0 && (person ? personYear(all, person, year).placed.length === 0 : groupYear(all, year).total === 0);

  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<"share" | "zip" | null>(null);
  const reduce = useRef(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const holdTimer = useRef<number | undefined>(undefined);
  const held = useRef(false);

  const go = (to: number) => { setIndex(Math.max(0, Math.min(cards.length - 1, to))); setProgress(0); };

  // auto-advance like an IG story; off with reduced motion
  useEffect(() => {
    if (reduce.current || paused || cards.length === 0) return;
    const id = window.setInterval(() => {
      setProgress((p) => {
        const next = p + 100 / (SLIDE_MS / 100);
        if (next < 100) return next;
        setIndex((i) => (i < cards.length - 1 ? i + 1 : i));
        return 0;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [paused, cards.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, cards.length]);

  const card = cards[index];
  const link = `${location.origin}/wrapped/${year}${person ? `/${encodeURIComponent(person)}` : ""}`;

  async function shareCurrent() {
    if (!card || busy) return;
    setBusy("share");
    try {
      const blob = await renderWrappedCard(card, { year, index, total: cards.length });
      const outcome = await shareImage(blob, { filename: `papin-wrapped-${year}-${card.id}.png`, title: t("wrapped.title"), text: t("wrapped.footer", { year }), url: link });
      if (outcome === "downloaded") toast.show({ message: t("share.story.saved"), kind: "success" });
    } catch {
      toast.show({ message: t("share.story.failed"), kind: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    if (busy || cards.length === 0) return;
    setBusy("zip");
    try {
      const entries = [];
      for (const [i, c] of cards.entries()) {
        const blob = await renderWrappedCard(c, { year, index: i, total: cards.length });
        entries.push({ name: `${String(i + 1).padStart(2, "0")}-${c.id}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      downloadBlob(new Blob([zipStored(entries)], { type: "application/zip" }), `papin-wrapped-${year}${person ? `-${person}` : ""}.zip`);
    } catch {
      toast.show({ message: t("share.story.failed"), kind: "error" });
    } finally {
      setBusy(null);
    }
  }

  const holdStart = () => {
    held.current = false;
    holdTimer.current = window.setTimeout(() => { held.current = true; setPaused(true); }, 220);
  };
  const holdEnd = (onTap?: () => void) => {
    window.clearTimeout(holdTimer.current);
    if (held.current) setPaused(false);
    else onTap?.();
  };

  const missing = !enabled
    ? t("wrapped.empty", { year })
    : !open
      ? t("wrapped.notYet", { year })
      : empty
        ? t(person ? "wrapped.empty" : "wrapped.emptyGroup", { year })
        : null;

  return (
    <main class="wrapped-page" style={{ minHeight: "100dvh", display: "grid", justifyItems: "center", alignContent: "start", gap: "var(--space-3)", padding: "var(--space-4)", background: "var(--bg)" }}>
      <div style={{ width: "100%", maxWidth: 520, display: "flex", alignItems: "center", gap: 8 }}>
        <Button variant="quiet" size="sm" icon="x" onClick={() => navigate("/")}>{t("wrapped.back")}</Button>
        <span class="mp-field__hint" style={{ marginLeft: "auto" }}>{person ? t("wrapped.for", { name: person }) : t("wrapped.kickerGroup")}</span>
      </div>
      {missing || !card ? (
        <EmptyState icon="gallery" title={missing ?? t("wrapped.preparing")} action={{ label: t("wrapped.back"), onClick: () => navigate("/") }} />
      ) : (
        <>
          <div
            class={`mp-wrapped${card.theme === "brand" ? "" : ` mp-wrapped--${card.theme}`}`}
            style={{ "--w": "min(calc(100vw - 32px), calc((100dvh - 190px) * 9 / 16), 420px)", touchAction: "pan-y", userSelect: "none" }}
            role="group"
            aria-roledescription="carousel"
            aria-label={`${card.aria}. ${t("wrapped.card", { n: index + 1, total: cards.length })}`}
          >
            <div class="mp-wrapped__bars" aria-hidden="true">
              {cards.map((c, i) => <i key={c.id} class={i < index ? "is-done" : ""} style={i === index ? { opacity: 0.35 + 0.65 * (progress / 100) } : undefined} />)}
            </div>
            <div class="mp-wrapped__kicker">{card.kicker}</div>
            <div class="mp-wrapped__body">
              {card.icon && <span style={{ justifySelf: "start" }}><TypeSticker type={{ slug: "x", icon: card.icon.url, fit: card.icon.fit }} size={96} /></span>}
              <div class="mp-wrapped__big">{card.big}</div>
              <p class="mp-wrapped__title">{card.title}</p>
              {card.text && <p class="mp-wrapped__text">{card.text}</p>}
              {card.flags && card.flags.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{card.flags.map((c) => <Flag key={c} code={c} size="lg" />)}</div>}
            </div>
            <div class="mp-wrapped__foot">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span class="mp-sticker mp-sticker--contain" style={{ "--tilt": "var(--tilt-1)" }}><img src="/img/icons/papa.png" alt="" /></span>
                {t("wrapped.footer", { year })}
              </span>
            </div>
            {/* tap zones: left third goes back, the rest goes forward; holding pauses */}
            <button type="button" aria-label={t("wrapped.prev")} class="wrapped-zone" style={{ position: "absolute", inset: "52px 66.6% 64px 0", background: "transparent", border: 0, cursor: "pointer" }}
              onPointerDown={holdStart} onPointerUp={() => holdEnd(() => go(index - 1))} onPointerLeave={() => { window.clearTimeout(holdTimer.current); if (held.current) setPaused(false); }} />
            <button type="button" aria-label={t("wrapped.next")} class="wrapped-zone" style={{ position: "absolute", inset: "52px 0 64px 33.4%", background: "transparent", border: 0, cursor: "pointer" }}
              onPointerDown={holdStart} onPointerUp={() => holdEnd(() => go(index + 1))} onPointerLeave={() => { window.clearTimeout(holdTimer.current); if (held.current) setPaused(false); }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            <Button variant="primary" icon="share" loading={busy === "share"} onClick={() => void shareCurrent()}>{t("wrapped.share")}</Button>
            <Button variant="secondary" icon="download" loading={busy === "zip"} onClick={() => void downloadAll()}>{t("wrapped.download")}</Button>
          </div>
          <span class="mp-field__hint" style={{ textAlign: "center" }}><Icon name="info" size="sm" /> {t("wrapped.hold")}</span>
        </>
      )}
    </main>
  );
}

