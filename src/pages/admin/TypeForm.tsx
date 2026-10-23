import { useEffect, useRef, useState } from "preact/hooks";
import { adminApi, type AdminType } from "../../admin/api";
import { adminTypes, loadAdminTypes, refreshCounts } from "../../admin/state";
import { errorText, slugify } from "../../admin/util";
import { Banner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { SwitchRow, TextField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { MapMarker } from "../../components/MapMarker";
import { Segmented } from "../../components/Segmented";
import { ApiError } from "../../lib/api";
import { cx } from "../../lib/cx";
import { t } from "../../lib/i18n";
import { loadBase } from "../../lib/store";
import { toast } from "../../lib/toast";
import type { IconFit } from "../../shared/types";
import { Modal } from "./Modal";

/** What the form is for: a new type, an existing one, or turning a free-text "Otro" value into a type. */
export type TypeFormMode = { kind: "new" } | { kind: "edit"; type: AdminType } | { kind: "promote"; text: string; count: number };

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_ICON_BYTES = 600_000;
/** Design tokens offered as swatches; their live value is stored as hex (the API keeps `#rrggbb`). */
const SWATCH_TOKENS = ["brand", "avatar-2", "avatar-3", "avatar-4", "avatar-5", "avatar-6"] as const;

function tokenHex(token: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "#31872e";
}

async function isPngOrWebp(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const webp = String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
  return png || webp;
}

function capitalise(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase("es") + text.slice(1) : text;
}

export function TypeFormModal({ mode, onClose }: { mode: TypeFormMode | null; onClose: () => void }) {
  const edit = mode?.kind === "edit" ? mode.type : null;
  const promote = mode?.kind === "promote" ? mode : null;
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [color, setColor] = useState("#31872e");
  const [fit, setFit] = useState<IconFit>("contain");
  const [order, setOrder] = useState("50");
  const [allowsText, setAllowsText] = useState(false);
  const [active, setActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState<{ label?: string; slug?: string; icon?: string; order?: string }>({});
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Reset the form each time it opens.
  useEffect(() => {
    if (!mode) return;
    const types = adminTypes.value;
    setFile(null);
    setErrors({});
    setBusy(false);
    setSlugTouched(false);
    if (mode.kind === "edit") {
      setLabel(mode.type.label);
      setSlug(mode.type.slug);
      setColor(mode.type.color.toLowerCase());
      setFit(mode.type.fit);
      setOrder(String(mode.type.sort_order));
      setAllowsText(mode.type.allows_text);
      setActive(mode.type.is_active);
    } else {
      const name = mode.kind === "promote" ? capitalise(mode.text) : "";
      setLabel(name);
      setSlug(slugify(name));
      setColor(tokenHex("brand"));
      setFit("contain");
      setOrder(String(Math.max(0, ...types.map((x) => x.sort_order)) + 1));
      setAllowsText(false);
      setActive(true);
    }
  }, [mode]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = async (next: File | undefined) => {
    if (!next) return;
    if (next.size > MAX_ICON_BYTES || !(await isPngOrWebp(next))) {
      setFile(null);
      setErrors((e) => ({ ...e, icon: t("admin.error.badIcon") }));
      return;
    }
    setErrors((e) => ({ ...e, icon: undefined }));
    setFile(next);
  };

  const submit = async () => {
    if (!mode || busy) return;
    const next: typeof errors = {};
    const cleanLabel = label.trim();
    if (!cleanLabel) next.label = t("admin.types.errLabel");
    if (mode.kind !== "edit" && !SLUG.test(slug)) next.slug = t("admin.types.errSlug");
    if (mode.kind !== "edit" && !file) next.icon = t("admin.error.iconRequired");
    const orderNumber = Number(order);
    if (mode.kind !== "promote" && (!Number.isInteger(orderNumber) || orderNumber < 0 || orderNumber > 999)) next.order = t("admin.types.errOrder");
    setErrors(next);
    if (Object.keys(next).length) return;

    const form = new FormData();
    form.set("label", cleanLabel);
    if (file) form.set("icon", file);
    setBusy(true);
    try {
      if (mode.kind === "promote") {
        form.set("text", mode.text);
        form.set("slug", slug);
        const res = await adminApi.promoteType(form);
        toast.show({ kind: "success", message: t("admin.types.promoted", { label: cleanLabel, n: res.retagged }) });
      } else {
        form.set("color", color);
        form.set("fit", fit);
        form.set("sort_order", String(orderNumber));
        // The API reads these as booleans: any text is true, so "off" is sent as an empty string.
        form.set("allows_text", allowsText ? "1" : "");
        form.set("is_active", active ? "1" : "");
        if (mode.kind === "new") {
          form.set("slug", slug);
          await adminApi.createType(form);
          toast.show({ kind: "success", message: t("admin.types.created", { label: cleanLabel }) });
        } else {
          await adminApi.updateType(mode.type.slug, form);
          toast.show({ kind: "success", message: t("admin.types.saved", { label: cleanLabel }) });
        }
      }
      await Promise.all([loadAdminTypes(), loadBase()]);
      void refreshCounts();
      onClose();
    } catch (e) {
      const msg = errorText(e);
      const code = e instanceof ApiError ? e.code : "";
      if (code === "slug_exists") setErrors({ slug: msg });
      else if (code === "bad_icon" || code === "icon_required") setErrors({ icon: msg });
      else toast.show({ kind: "error", message: msg });
      setBusy(false);
    }
  };

  const iconUrl = preview ?? edit?.icon ?? null;
  const title = mode?.kind === "edit" ? t("admin.types.editTitle", { label: mode.type.label }) : promote ? t("admin.types.promoteTitle") : t("admin.types.newTitle");
  const swatches = mode ? SWATCH_TOKENS.map((token) => ({ token, hex: tokenHex(token) })) : [];

  return (
    <Modal
      open={mode !== null}
      wide
      sticky
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" loading={busy} icon={mode?.kind === "edit" ? "check" : "plus"} onClick={() => void submit()}>
            {busy ? t("admin.types.saving") : mode?.kind === "edit" ? t("admin.types.save") : promote ? t("admin.types.promoteConfirm") : t("admin.types.create")}
          </Button>
        </>
      }
    >
      <form class="mp-typeform" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <div class="mp-typeform__col">
          <div
            class={cx("mp-dropzone", over && "is-over")}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void pick(e.dataTransfer?.files[0]);
            }}
          >
            {iconUrl ? (
              <span class={cx("mp-sticker", fit === "contain" && "mp-sticker--contain")} style="--s:72px;--tilt:var(--tilt-1)">
                <img src={iconUrl} alt="" />
              </span>
            ) : (
              <Icon name="upload" size="lg" />
            )}
            <b style="color:var(--ink-strong)">{file ? file.name : edit ? t("admin.types.replaceIcon") : t("admin.types.drop")}</b>
            <span class="mp-field__hint">{t("admin.types.dropHint")}</span>
            <Button size="sm" variant="secondary" icon="image" onClick={() => input.current?.click()}>
              {t("admin.types.chooseFile")}
            </Button>
            <input ref={input} type="file" accept="image/png,image/webp" class="mp-sr" tabIndex={-1} aria-label={t("admin.types.iconFile")} onChange={(e) => { void pick((e.currentTarget as HTMLInputElement).files?.[0]); (e.currentTarget as HTMLInputElement).value = ""; }} />
          </div>
          {errors.icon && (
            <span class="mp-field__error" role="alert">
              <Icon name="alert" />
              {errors.icon}
            </span>
          )}

          <TextField
            label={t("admin.types.label")}
            value={label}
            maxLength={40}
            error={errors.label}
            onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              setLabel(v);
              if (!slugTouched && mode?.kind !== "edit") setSlug(slugify(v));
            }}
          />
          <TextField
            label={t("admin.types.slug")}
            mono
            value={slug}
            maxLength={40}
            disabled={mode?.kind === "edit"}
            error={errors.slug}
            hint={mode?.kind === "edit" ? t("admin.types.slugLocked") : t("admin.types.slugHint")}
            onInput={(e) => {
              setSlugTouched(true);
              setSlug((e.currentTarget as HTMLInputElement).value.toLowerCase());
            }}
          />
        </div>

        <div class="mp-typeform__col">
          {!promote && (
            <>
              <div class="mp-field">
                <span class="mp-field__label" id="tf-color">
                  {t("admin.types.color")}
                </span>
                <div class="mp-typeform__colors" role="group" aria-labelledby="tf-color">
                  {swatches.map((s) => (
                    <button
                      key={s.token}
                      type="button"
                      class="mp-swatch mp-typeform__swatch"
                      style={`background:${s.hex}`}
                      aria-pressed={color === s.hex}
                      aria-label={`${t("admin.types.color")} ${s.hex}`}
                      onClick={() => setColor(s.hex)}
                    />
                  ))}
                  <label class="mp-typeform__custom">
                    <input type="color" value={color} aria-label={t("admin.types.customColor")} onInput={(e) => setColor((e.currentTarget as HTMLInputElement).value.toLowerCase())} />
                    <span class="mp-field__hint mp-typeform__hex">{color}</span>
                  </label>
                </div>
              </div>
              <div class="mp-field">
                <span class="mp-field__label" id="tf-fit">
                  {t("admin.types.fit")}
                </span>
                <Segmented
                  labelledBy="tf-fit"
                  value={fit}
                  onChange={setFit}
                  options={[
                    { value: "contain", label: t("admin.types.fitContain") },
                    { value: "cover", label: t("admin.types.fitCover") },
                  ]}
                />
              </div>
              <TextField
                label={t("admin.types.order")}
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={order}
                error={errors.order}
                hint={t("admin.types.orderHint")}
                onInput={(e) => setOrder((e.currentTarget as HTMLInputElement).value)}
              />
              <SwitchRow label={t("admin.types.allowsText")} description={t("admin.types.allowsTextHint")} checked={allowsText} onChange={setAllowsText} />
              <SwitchRow label={t("admin.types.active")} description={t("admin.types.activeHint")} checked={active} onChange={setActive} />
            </>
          )}
          <div class="mp-field">
            <span class="mp-field__label">{t("admin.types.preview")}</span>
            <div class="mp-typeform__preview" aria-hidden={iconUrl ? undefined : "true"}>
              {iconUrl && (
                <>
                  <MapMarker id={`preview-${slug || "x"}-1`} types={[label || t("admin.types.previewLabel")]} iconUrl={iconUrl} fit={fit} label={null} />
                  <MapMarker id={`preview-${slug || "x"}-2`} types={[label || t("admin.types.previewLabel")]} iconUrl={iconUrl} fit={fit} small label={null} />
                </>
              )}
              {!iconUrl && <span class="mp-field__hint">{t("admin.types.previewEmpty")}</span>}
            </div>
          </div>
          {promote && (
            <Banner kind="countdown" icon="merge">
              {t("admin.types.promoteBanner", { n: promote.count, text: promote.text })}
            </Banner>
          )}
        </div>
      </form>
    </Modal>
  );
}
