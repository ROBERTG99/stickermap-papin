import { useEffect, useRef, useState } from "preact/hooks";
import { readExifFixed } from "../add/exif";
import { DeviceError, getDeviceFix, type DeviceFix } from "../add/device";
import { ApiError, api } from "../lib/api";
import { formatKm } from "../lib/format";
import { t } from "../lib/i18n";
import { lastPerson } from "../lib/local";
import { processPhoto } from "../lib/photo";
import { config, loadSpots, people } from "../lib/store";
import { toast } from "../lib/toast";
import { getTurnstileToken } from "../lib/turnstile";
import { convertVideo, posterFrame, probeVideo, probeWithElement } from "../lib/video";
import { defaultWindow } from "../lib/video-meta";
import { haversineMeters } from "../shared/geo";
import { VERIFY_RADIUS_M } from "../shared/life";
import type { Derivative } from "../lib/photo";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Combobox } from "./Field";
import { Icon, type IconName } from "./Icon";
import { ProgressBar } from "./ProgressBar";

type Status = "alive" | "damaged" | "covered" | "removed";
const STATUSES: { value: Status; icon: IconName; gone: boolean }[] = [
  { value: "alive", icon: "alive", gone: false },
  { value: "damaged", icon: "damaged", gone: false },
  { value: "covered", icon: "covered", gone: true },
  { value: "removed", icon: "gone", gone: true },
];

interface Media {
  display: Derivative;
  thumb: Derivative;
  takenAt: string | null;
  video: { blob: Blob; durationMs: number; width: number; height: number } | null;
  previewUrl: string;
}

interface SightingSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after a sighting was stored, so the page can refresh. */
  onDone?: (result: { verified: boolean; pending: boolean }) => void;
  spot: { id: string; lat: number; lng: number; place: string };
  via?: "app" | "radar";
}

/** "¿Sigue ahí?" check-in (F4): one of four states, an optional photo or clip, "Soy:", and the device position to verify it. */
export function SightingSheet({ open, onClose, onDone, spot, via = "app" }: SightingSheetProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [busy, setBusy] = useState<"photo" | "video" | null>(null);
  const [soy, setSoy] = useState(lastPerson.get());
  const [fix, setFix] = useState<DeviceFix | null>(null);
  const [fixState, setFixState] = useState<"idle" | "finding" | "denied" | "failed">("idle");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const token = useRef(0);
  const videoOn = config.value?.features.video === true;

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setMedia(null);
    setFailure(null);
    setFix(null);
    setFixState("finding");
    setSoy(lastPerson.get());
    const mine = ++token.current;
    getDeviceFix()
      .then((f) => { if (token.current === mine) { setFix(f); setFixState("idle"); } })
      .catch((e: unknown) => { if (token.current === mine) setFixState(e instanceof DeviceError && e.kind === "denied" ? "denied" : "failed"); });
    return () => { token.current++; };
  }, [open, spot.id]);

  useEffect(() => () => { if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl); }, [media?.previewUrl]);

  const distance = fix ? haversineMeters(fix.lat, fix.lng, spot.lat, spot.lng) : null;
  const near = distance !== null && distance <= VERIFY_RADIUS_M;

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setBusy("photo");
    setFailure(null);
    try {
      const processed = await processPhoto(file);
      const exif = await readExifFixed(file);
      if (!processed.display || !processed.thumb) throw new Error("undecodable");
      setMedia({ display: processed.display, thumb: processed.thumb, takenAt: exif?.takenAt ?? processed.exif.takenAt ?? null, video: null, previewUrl: URL.createObjectURL(processed.display.blob) });
    } catch {
      setFailure(t("sighting.photoFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function pickVideo(file: File | undefined) {
    if (!file) return;
    setBusy("video");
    setProgress(0);
    setFailure(null);
    try {
      const probe = await probeVideo(file).catch(() => probeWithElement(file));
      const result = await convertVideo(file, probe, defaultWindow(probe.durationMs), { muted: false, onProgress: (f) => setProgress(Math.round(f * 100)) });
      // a clip the browser could not convert would go up with the phone's metadata: sightings only take converted ones
      if (result.needsTranscode) throw new Error("cannot_convert");
      const poster = await processPhoto(new File([await posterFrame(result.blob, 500)], "poster.jpg", { type: "image/jpeg" }));
      if (!poster.display || !poster.thumb) throw new Error("poster");
      setMedia({ display: poster.display, thumb: poster.thumb, takenAt: probe.takenAt, video: { blob: result.blob, durationMs: result.durationMs, width: result.width, height: result.height }, previewUrl: URL.createObjectURL(poster.display.blob) });
    } catch {
      setFailure(t("sighting.videoFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!status || sending) return;
    setSending(true);
    setProgress(0);
    setFailure(null);
    try {
      const sitekey = config.value?.turnstile_sitekey ?? (await api.config()).turnstile_sitekey;
      const turnstile_token = await getTurnstileToken(sitekey);
      const form = new FormData();
      form.set("meta", JSON.stringify({
        status, via, turnstile_token,
        lat: fix ? fix.lat : null, lng: fix ? fix.lng : null, location_accuracy_m: fix ? Math.round(fix.accuracyM) : null,
        reporter: soy.trim() || null, taken_at: media?.takenAt ?? null,
        video_duration_ms: media?.video?.durationMs ?? null, video_w: media?.video?.width ?? null, video_h: media?.video?.height ?? null,
      }));
      if (media) {
        form.set("display", media.display.blob, `display.${media.display.blob.type === "image/jpeg" ? "jpg" : "webp"}`);
        form.set("thumb", media.thumb.blob, `thumb.${media.thumb.blob.type === "image/jpeg" ? "jpg" : "webp"}`);
        if (media.video) form.set("video", media.video.blob, "video.mp4");
      }
      const result = await api.createSighting(spot.id, form, { onProgress: (f) => setProgress(Math.min(99, Math.round(f * 100))) });
      if (soy.trim()) lastPerson.set(soy);
      void loadSpots();
      toast.show({ message: t(result.verified ? "sighting.done" : "sighting.donePending"), kind: "success" });
      onDone?.({ verified: result.verified, pending: result.pending });
      onClose();
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(0, "offline");
      setFailure(t(e.status === 0 ? "sighting.error.offline" : e.status === 429 ? "sighting.error.rate_limited" : e.status === 507 ? "sighting.error.storage" : e.status === 403 ? "sighting.error.turnstile" : "sighting.error.server"));
    } finally {
      setSending(false);
    }
  }

  const goneStatus = status === "covered" || status === "removed";
  const banner = goneStatus
    ? t(near ? "sighting.goneNear" : "sighting.goneRule")
    : fixState === "finding"
    ? t("sighting.finding")
    : distance === null
      ? t(fixState === "denied" ? "sighting.noLocationDenied" : "sighting.noLocation")
      : near
        ? t("sighting.near", { dist: distance < 1000 ? `${Math.round(distance)} m` : formatKm(distance) })
        : t("sighting.far", { dist: formatKm(distance) });

  return (
    <Dialog
      open={open}
      title={t("components.life.check")}
      onClose={onClose}
      layout="sheet"
      art={<div class="mp-field__hint" style={{ margin: 0 }}>{spot.place}</div>}
      actions={
        <>
          <Button variant="primary" size="lg" loading={sending} disabled={!status || busy !== null} onClick={() => void send()}>
            {sending ? t("add.submit.sending") : t("add.common.submit")}
          </Button>
          <Button variant="secondary" onClick={onClose}>{t("common.action.cancel")}</Button>
        </>
      }
    >
      <div class="mp-statusgrid" role="group" aria-label={t("sighting.how")}>
        {STATUSES.map((s) => (
          <button key={s.value} type="button" class={`mp-statusbtn${s.gone ? " mp-statusbtn--gone" : ""}`} aria-pressed={status === s.value} onClick={() => setStatus(s.value)}>
            <Icon name={s.icon} />
            {t(`components.life.status.${s.value}`)}
            <small>{t(`components.life.statusHint.${s.value}`)}</small>
          </button>
        ))}
      </div>
      <Banner kind="info" icon={near ? "check" : "info"}>{banner}</Banner>

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void pickPhoto(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
      {videoOn && <input ref={videoInput} type="file" accept="video/*" capture="environment" hidden onChange={(e) => { void pickVideo(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />}
      {media ? (
        <div class="add-photo" style={{ marginTop: "var(--space-3)" }}>
          <div class="add-photo__thumb" style={{ width: 96 }}>
            <div class="mp-photo" style={{ "--ratio": 1 }}><img src={media.previewUrl} alt="" /></div>
          </div>
          <div class="add-photo__tools">
            <span class="mp-field__hint">{t(media.video ? "sighting.hasVideo" : "sighting.hasPhoto")}</span>
            <Button variant="danger-ghost" size="sm" icon="trash" onClick={() => setMedia(null)}>{t("sighting.removeMedia")}</Button>
          </div>
        </div>
      ) : busy === "video" ? (
        <ProgressBar value={progress} label={t("add.video.processing")} />
      ) : busy === "photo" ? (
        <span class="mp-src mp-src--pending" role="status"><span class="mp-spinner" aria-hidden="true" />{t("add.photo.reading")}</span>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: videoOn ? "1fr 1fr" : "1fr", gap: 8, marginTop: "var(--space-3)" }}>
          <button type="button" class="mp-typetile" style={{ padding: "12px 8px" }} onClick={() => camera.current?.click()}><Icon name="camera" />{t("add.photo.camera")}</button>
          {videoOn && <button type="button" class="mp-typetile" style={{ padding: "12px 8px" }} onClick={() => videoInput.current?.click()}><Icon name="video" />{t("sighting.video")}</button>}
        </div>
      )}

      <Combobox
        label={t("add.what.soy")}
        options={people.value.map((p) => ({ name: p.name, count: p.reported }))}
        value={soy ? [soy] : []}
        onChange={(names) => setSoy(names[0] ?? "")}
        multiple={false}
        allowCreate
        class="sighting-soy"
      />
      {sending && <ProgressBar value={progress} label={t("add.submit.sending")} />}
      {failure && <div class="mp-field__error" role="alert"><Icon name="alert" />{failure}</div>}
    </Dialog>
  );
}
