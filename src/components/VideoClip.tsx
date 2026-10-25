import { useEffect, useRef, useState } from "preact/hooks";
import { cx } from "../lib/cx";
import { t } from "../lib/i18n";
import { formatClock } from "../lib/video-meta";
import { Icon } from "./Icon";

interface VideoClipProps {
  src: string;
  /** Poster frame: shown with a play button until the clip starts (the poster is also the spot's thumbnail). */
  poster: string | null;
  durationMs?: number | null;
  /** Gallery cards: play muted only while at least 60% of the card is on screen, pause when it leaves. */
  autoplayInView?: boolean;
  /** CSS aspect ratio while the poster has not loaded. */
  ratio?: string;
  class?: string;
  label?: string;
}

/**
 * A spot's clip (F1, design VideoClip): poster with a play button, then inline playback, muted and `playsinline`, with a
 * thin progress bar, a mute toggle and fullscreen. iOS Safari needs the Range support of `/media/video/*`.
 */
export function VideoClip({ src, poster, durationMs, autoplayInView, ratio = "4/5", class: className, label }: VideoClipProps) {
  const box = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!autoplayInView || !box.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.intersectionRatio >= 0.6) setStarted(true);
        else el.current?.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, [autoplayInView]);

  useEffect(() => {
    if (started) void el.current?.play().catch(() => setPaused(true));
  }, [started]);

  const toggleMute = (e: Event) => {
    e.stopPropagation();
    setMuted((m) => !m);
  };
  const fullscreen = (e: Event) => {
    e.stopPropagation();
    const v = el.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) void v.requestFullscreen().catch(() => undefined);
    else v.webkitEnterFullscreen?.();
  };

  return (
    <div ref={box} class={cx("mp-video", className)} style={{ aspectRatio: started ? undefined : ratio }} role="group" aria-label={label ?? t("components.video.label")}>
      {started ? (
        <video
          ref={el}
          src={src}
          poster={poster ?? undefined}
          muted={muted}
          autoPlay
          loop
          playsInline
          preload="metadata"
          style={{ display: "block", width: "100%", maxHeight: "60dvh", objectFit: "contain", background: "var(--ink-strong)" }}
          onClick={autoplayInView ? undefined : () => { const v = el.current; if (!v) return; if (v.paused) void v.play(); else v.pause(); }}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? (e.currentTarget.currentTime / e.currentTarget.duration) * 100 : 0)}
        />
      ) : (
        <>
          {poster && <img src={poster} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
          {autoplayInView ? (
            <span class="mp-video__play" aria-hidden="true"><Icon name="play" /></span>
          ) : (
            <button type="button" class="mp-video__play" aria-label={t("components.video.play")} onClick={() => setStarted(true)}>
              <Icon name="play" />
            </button>
          )}
          {durationMs ? <span class="mp-video__dur"><Icon name="video" />{formatClock(durationMs)}</span> : null}
        </>
      )}
      {started && !autoplayInView && (
        <>
          <button type="button" class="mp-video__mute" aria-label={t(muted ? "components.video.unmute" : "components.video.mute")} onClick={toggleMute}>
            <Icon name={muted ? "volume-x" : "volume"} />
          </button>
          <button type="button" class="mp-video__mute" style={{ top: 52 }} aria-label={t("components.video.fullscreen")} onClick={fullscreen}>
            <Icon name="expand" />
          </button>
          {paused && (
            <button type="button" class="mp-video__play" aria-label={t("components.video.play")} onClick={() => void el.current?.play()}>
              <Icon name="play" />
            </button>
          )}
        </>
      )}
      {started && <div class="mp-video__bar" aria-hidden="true"><i style={{ "--value": `${progress}%` }} /></div>}
    </div>
  );
}
