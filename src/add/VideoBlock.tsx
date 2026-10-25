import { useEffect, useRef } from "preact/hooks";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { SwitchRow } from "../components/Field";
import { Icon } from "../components/Icon";
import { ProgressBar } from "../components/ProgressBar";
import { t } from "../lib/i18n";
import { formatClock } from "../lib/video-meta";
import type { VideoState } from "./state";
import type { AddForm } from "./useAddForm";

/** The clip of card 1 (F1): reading, trim window + mute, converting, then the poster with its length. */
export function VideoBlock({ form, video }: { form: AddForm; video: VideoState }) {
  const { actions } = form;

  if (video.status === "probing") {
    return (
      <span class="mp-src mp-src--pending" role="status">
        <span class="mp-spinner" aria-hidden="true" />
        {t("add.video.reading")}
      </span>
    );
  }

  if (video.status === "processing") {
    return <ProgressBar value={video.progress} label={t("add.video.processing")} />;
  }

  if (video.status === "ready" && video.result) {
    const untranscoded = video.result.needsTranscode;
    return (
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <div class="add-photo">
          <div class="add-photo__thumb">
            <div class="mp-video" role="img" aria-label={t("add.video.ready")} style={{ aspectRatio: `${video.result.width}/${video.result.height}`, maxHeight: "30dvh" }}>
              {video.posterUrl && <img src={video.posterUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
              <span class="mp-video__play" aria-hidden="true"><Icon name="play" /></span>
              <span class="mp-video__dur"><Icon name="video" />{formatClock(video.result.durationMs)}</span>
            </div>
          </div>
          <div class="add-photo__tools">
            <Button variant="quiet" size="sm" icon="scissors" onClick={actions.editVideo}>{t("add.video.change")}</Button>
            <Button variant="danger-ghost" size="sm" icon="trash" onClick={actions.removeVideo}>{t("add.video.remove")}</Button>
          </div>
        </div>
        {untranscoded && <Banner kind="info">{t("add.video.untranscoded")}</Banner>}
      </div>
    );
  }

  return <TrimEditor form={form} video={video} />;
}

function TrimEditor({ form, video }: { form: AddForm; video: VideoState }) {
  const { actions } = form;
  const probe = video.probe;
  const player = useRef<HTMLVideoElement>(null);
  const { startMs, endMs } = video.window;
  const total = probe?.durationMs ?? 0;

  // the preview loops inside the chosen window
  useEffect(() => {
    const el = player.current;
    if (!el) return;
    el.currentTime = startMs / 1000;
  }, [startMs]);

  if (!probe) return null;
  const onTime = () => {
    const el = player.current;
    if (el && el.currentTime >= endMs / 1000) el.currentTime = startMs / 1000;
  };

  return (
    <div class="mp-trim" style={{ gap: "var(--space-3)" }}>
      <video
        ref={player}
        src={video.previewUrl}
        class="mp-video"
        style={{ width: "100%", maxHeight: "36dvh", background: "var(--ink-strong)", borderRadius: "var(--radius-md)" }}
        controls
        playsInline
        muted={video.muted || true}
        preload="metadata"
        aria-label={t("add.video.preview")}
        onTimeUpdate={onTime}
      />
      <p class="mp-field__hint" style={{ margin: 0 }}>{t("add.video.trim")}</p>
      <label class="mp-field__label" for="add-video-from">{t("add.video.start")}</label>
      <input
        id="add-video-from" class="mp-range" type="range" min={0} max={Math.max(0, total - 500)} step={100} value={startMs}
        style={{ "--value": `${total ? (startMs / total) * 100 : 0}%` }}
        onInput={(e) => actions.setVideoWindow({ startMs: Number(e.currentTarget.value), endMs }, "start")}
      />
      <label class="mp-field__label" for="add-video-to">{t("add.video.end")}</label>
      <input
        id="add-video-to" class="mp-range" type="range" min={500} max={total} step={100} value={endMs}
        style={{ "--value": `${total ? (endMs / total) * 100 : 0}%` }}
        onInput={(e) => actions.setVideoWindow({ startMs, endMs: Number(e.currentTarget.value) }, "end")}
      />
      <div class="mp-trim__times">
        <span><b>{formatClock(startMs)}</b> – <b>{formatClock(endMs)}</b></span>
        <span>{t("add.video.length", { s: Math.round((endMs - startMs) / 1000) })}</span>
      </div>
      {probe.hasAudio && <SwitchRow label={t("add.video.mute")} description={t("add.video.muteHint")} checked={video.muted} onChange={actions.setVideoMuted} />}
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        <Button variant="primary" icon="check" onClick={() => void actions.confirmVideo()}>{t("add.video.use")}</Button>
        <Button variant="danger-ghost" size="sm" icon="trash" onClick={actions.removeVideo}>{t("add.video.remove")}</Button>
      </div>
    </div>
  );
}
