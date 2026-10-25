import { useRef } from "preact/hooks";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { StickerCard } from "../components/StickerCard";
import { t } from "../lib/i18n";
import { navigate } from "../lib/router";
import { config } from "../lib/store";
import { VideoBlock } from "./VideoBlock";
import type { AddForm } from "./useAddForm";

/** Card 1, Foto: optional but encouraged. Picks, previews, rotates and removes the photo; flags a photo that is already on the map. */
export function PhotoCard({ form }: { form: AddForm }) {
  const { s, actions } = form;
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const photo = s.photo;
  const video = s.video;
  const videoOn = config.value?.features.video === true;
  const processing = photo?.status === "processing" || (!!video && video.status !== "ready");
  const videoStatus = video && video.status !== "ready" && photo?.status !== "processing" ? t(`add.video.status.${video.status}`) : null;

  const onCamera = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    actions.pickFiles([...(input.files ?? [])], true);
    input.value = "";
  };
  const onVideo = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    actions.pickFiles([...(input.files ?? [])].slice(0, 1), true);
    input.value = "";
  };
  const onGallery = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    actions.pickFiles([...(input.files ?? [])], false);
    input.value = "";
  };

  return (
    <StickerCard
      id="add-card-1"
      step={1}
      title={t("add.photo.title")}
      state={processing ? "processing" : photo || video ? "done" : "default"}
      status={videoStatus ?? (processing ? t("add.photo.reading") : t("add.photo.optional"))}
    >
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onCamera} />
      <input ref={gallery} type="file" accept={videoOn ? "image/*,video/*" : "image/*"} multiple hidden onChange={onGallery} />
      {videoOn && <input ref={videoInput} type="file" accept="video/*" capture="environment" hidden onChange={onVideo} />}

      {!photo && !video ? (
        <>
          <div class="add-photo__pick">
            <button type="button" class="mp-typetile" onClick={() => camera.current?.click()}>
              <Icon name="camera" size="lg" />
              {t("add.photo.camera")}
            </button>
            {videoOn && (
              <button type="button" class="mp-typetile" onClick={() => videoInput.current?.click()}>
                <Icon name="video" size="lg" />
                {t("add.photo.video")}
              </button>
            )}
            <button type="button" class="mp-typetile" onClick={() => gallery.current?.click()}>
              <Icon name="image" size="lg" />
              {t(videoOn ? "add.photo.galleryAny" : "add.photo.gallery")}
            </button>
          </div>
          <div class="add-photo__status">
            <p class="mp-field__hint" style={{ margin: 0, flex: 1 }}>{t(videoOn ? "add.photo.hintVideo" : "add.photo.hint")}</p>
            <Button variant="quiet" size="sm" icon="gallery" onClick={() => navigate("/nuevo/varias")}>
              {t("add.photo.many")}
            </Button>
          </div>
        </>
      ) : (
        <>
          {photo && (<>
          <div class="add-photo">
            <div class="add-photo__thumb">
              <div class="mp-photo" role="img" aria-label={t("add.photo.alt")}>
                {photo.previewUrl ? <img src={photo.previewUrl} alt="" /> : <Icon name="image" size="lg" />}
              </div>
            </div>
            <div class="add-photo__tools">
              {photo.processed?.decoded && (
                <Button variant="quiet" size="sm" icon="rotate" loading={photo.rotating} onClick={actions.rotate}>
                  {t("add.photo.rotate")}
                </Button>
              )}
              <Button variant="quiet" size="sm" icon="image" onClick={() => gallery.current?.click()}>
                {t("add.photo.change")}
              </Button>
              <Button variant="danger-ghost" size="sm" icon="trash" onClick={actions.removePhoto}>
                {t("add.photo.remove")}
              </Button>
            </div>
          </div>
          <div class="add-photo__extra">
            {processing && (
              <span class="mp-src mp-src--pending" role="status">
                <span class="mp-spinner" aria-hidden="true" />
                {t("add.photo.reading")}
              </span>
            )}
            {photo.processed && !photo.processed.decoded && <Banner kind="info">{t("add.photo.undecoded")}</Banner>}
            {s.duplicate && s.duplicateStage === "closed" && !photo.keepAnyway && (
              <Banner kind="info" icon="alert" action={{ label: t("add.dup.review"), onClick: () => form.set({ duplicateStage: "ask" }) }}>
                {t("add.dup.title")}
              </Banner>
            )}
          </div>
          </>)}
          {video && (
            <div style={{ marginTop: photo ? "var(--space-4)" : 0 }}>
              <VideoBlock form={form} video={video} />
            </div>
          )}
          {videoOn && !video && photo && (
            <Button variant="quiet" size="sm" icon="video" onClick={() => videoInput.current?.click()}>{t("add.photo.video")}</Button>
          )}
          {!photo && video && (
            <Button variant="quiet" size="sm" icon="camera" onClick={() => camera.current?.click()}>{t("add.photo.camera")}</Button>
          )}
        </>
      )}
      {s.videoError && (
        <div class="mp-field__error" role="alert" style={{ marginTop: "var(--space-3)" }}>
          <Icon name="alert" />
          {t(`add.photo.error.video_${s.videoError}`)}
        </div>
      )}
      {s.photoError && (
        <div class="mp-field__error" role="alert" style={{ marginTop: "var(--space-3)" }}>
          <Icon name="alert" />
          {t(`add.photo.error.${s.photoError}`)}
        </div>
      )}
    </StickerCard>
  );
}
