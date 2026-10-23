import { useCallback, useEffect, useState } from "preact/hooks";
import { adminApi, downloadFrom, type AdminSettings, type AuditEntry, type FeatureKey, type SettingsPatch } from "../../admin/api";
import { attempt, formatAgo, formatBytes, toastError } from "../../admin/util";
import { Badge } from "../../components/Badge";
import { Banner } from "../../components/Banner";
import { Button } from "../../components/Button";
import { TextField } from "../../components/Field";
import { Icon } from "../../components/Icon";
import { Segmented } from "../../components/Segmented";
import { Skeleton } from "../../components/Skeleton";
import { cx } from "../../lib/cx";
import { formatNumber } from "../../lib/format";
import { t } from "../../lib/i18n";
import { loadBase } from "../../lib/store";
import { toast } from "../../lib/toast";
import { DEFAULT_STYLE_URL } from "../../map/style";
import type { FeatureFlag, Lang, ModerationMode } from "../../shared/types";
import { PageHead } from "./parts";

const FEATURES: readonly { key: FeatureKey; label: string; hint: string }[] = [
  { key: "instagram", label: "admin.settings.f.instagram", hint: "admin.settings.f.instagramHint" },
  { key: "video", label: "admin.settings.f.video", hint: "admin.settings.f.videoHint" },
  { key: "sightings", label: "admin.settings.f.sightings", hint: "admin.settings.f.sightingsHint" },
  { key: "globe_wrapped", label: "admin.settings.f.globe", hint: "admin.settings.f.globeHint" },
];

const MODES: readonly ModerationMode[] = ["open", "approval"];
const GB = 1024 ** 3;

const asFlag = (v: string | undefined): FeatureFlag => (v === "admin" || v === "on" ? v : "off");

/** Radio card of the design (9f): dot + bold label + one-line hint. */
function RadioCard({ checked, label, hint, onSelect }: { checked: boolean; label: string; hint: string; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} class={cx("mp-radio", checked && "is-on")} onClick={onSelect}>
      <span class="mp-radio__dot" aria-hidden="true" />
      <span>
        <b>{label}</b>
        <br />
        <span class="mp-field__hint">{hint}</span>
      </span>
    </button>
  );
}

/** Ajustes (Page12AdminPeople 9f): moderation, storage meter, backups, language, map style and the Phase 2 feature flags. */
export default function SettingsPage() {
  const [data, setData] = useState<AdminSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [mapUrl, setMapUrl] = useState("");
  const [mapError, setMapError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"d1" | "gpkg" | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await adminApi.settings();
      setData(res);
      setMapUrl(res.settings.map_style_url ?? DEFAULT_STYLE_URL);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: SettingsPatch, message: string, key: string): Promise<boolean> => {
    setSaving(key);
    const ok = await attempt(() => adminApi.saveSettings(patch));
    setSaving(null);
    if (!ok) return false;
    setData((d) => (d ? { ...d, settings: { ...d.settings, ...patch } } : d));
    toast.show({ kind: "success", message });
    void loadBase(); // the public config (mode, flags) changed
    return true;
  };

  const download = async (kind: "d1" | "gpkg") => {
    setDownloading(kind);
    try {
      const name = await downloadFrom(`/api/admin/backup/latest?kind=${kind}`, kind === "d1" ? "stickermap-d1.sql.gz" : "stickermap.gpkg");
      toast.show({ kind: "success", message: t("admin.settings.downloaded", { file: name }) });
    } catch (e) {
      toastError(e);
    } finally {
      setDownloading(null);
    }
  };

  const saveMapUrl = async () => {
    const next = mapUrl.trim();
    try {
      const u = new URL(next);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
    } catch {
      setMapError(t("admin.settings.mapError"));
      return;
    }
    setMapError("");
    await save({ map_style_url: next }, t("admin.settings.mapSaved"), "map");
  };

  const loadAudit = async () => {
    const rows = await attempt(() => adminApi.audit(30));
    if (rows) setAudit(rows);
  };

  if (failed) {
    return (
      <>
        <PageHead title={t("admin.settings.title")} />
        <div class="mp-admin__body mp-admin-pad">
          <div class="mp-banner mp-banner--error" role="alert">
            <Icon name="alert" />
            <span>{t("admin.error.loadFailed")}</span>
            <Button size="sm" variant="secondary" class="mp-banner__action" onClick={() => void load()}>
              {t("common.action.retry")}
            </Button>
          </div>
        </div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHead title={t("admin.settings.title")} />
        <div class="mp-admin__body mp-settings" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={180} radius={20} />
          ))}
        </div>
      </>
    );
  }

  const s = data.settings;
  const mode: ModerationMode = s.moderation_mode === "approval" ? "approval" : "open";
  const lang: Lang = s.default_lang === "en" ? "en" : "es";
  const { used_bytes, limit_bytes, level } = data.storage;
  const pct = Math.min(100, (used_bytes / limit_bytes) * 100);

  return (
    <>
      <PageHead title={t("admin.settings.title")}>
        <span class="mp-field__hint mp-admin-mode">{t(mode === "approval" ? "admin.settings.modeApproval" : "admin.settings.modeOpen")}</span>
      </PageHead>

      <div class="mp-admin__body mp-settings">
        <section class="mp-card mp-settings__card" aria-labelledby="st-mod">
          <h2 class="mp-card__title" id="st-mod">
            {t("admin.settings.moderation")}
          </h2>
          <div role="radiogroup" aria-labelledby="st-mod" class="mp-settings__radios">
            {MODES.map((m) => (
              <RadioCard
                key={m}
                checked={mode === m}
                label={t(m === "open" ? "admin.settings.modeOpen" : "admin.settings.modeApproval")}
                hint={t(m === "open" ? "admin.settings.modeOpenHint" : "admin.settings.modeApprovalHint")}
                onSelect={() => mode !== m && void save({ moderation_mode: m }, t("admin.settings.modeSaved", { mode: t(m === "open" ? "admin.settings.modeOpen" : "admin.settings.modeApproval") }), "mode")}
              />
            ))}
          </div>
        </section>

        <section class="mp-card mp-settings__card" aria-labelledby="st-storage">
          <h2 class="mp-card__title" id="st-storage">
            {t("admin.settings.storage")}
          </h2>
          <div class="mp-progress__label">
            <span>{t("admin.settings.storageUsed", { used: formatBytes(used_bytes), limit: formatBytes(limit_bytes) })}</span>
            <Badge variant={level === "ok" ? "brand" : level === "warning" ? "neutral" : "solid"} icon={level === "ok" ? "check" : "alert"}>
              {t(`admin.settings.level.${level}`)}
            </Badge>
          </div>
          <div class="mp-admin-meter">
            <div
              class={cx("mp-progress", "mp-admin-meter__track", `is-${level}`)}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct * 10) / 10}
              aria-valuetext={t("admin.settings.storageText", { used: formatBytes(used_bytes), limit: formatBytes(limit_bytes), level: t(`admin.settings.level.${level}`) })}
              aria-label={t("admin.settings.storage")}
            >
              <div class="mp-progress__bar" style={{ "--value": `${Math.max(pct, used_bytes > 0 ? 1 : 0)}%` }} />
            </div>
            <span class="mp-admin-meter__tick" style={{ left: `${(7 * GB * 100) / limit_bytes}%` }} aria-hidden="true">
              <i />7 GB
            </span>
            <span class="mp-admin-meter__tick" style={{ left: `${(9 * GB * 100) / limit_bytes}%` }} aria-hidden="true">
              <i />9 GB
            </span>
          </div>
          <span class="mp-field__hint">{t("admin.settings.storageHint", { pct: formatNumber(pct, pct < 10 ? 1 : 0) })}</span>
          {level !== "ok" && (
            <Banner kind="error" icon="alert">
              {t(level === "warning" ? "admin.settings.storageWarning" : "admin.settings.storageCritical")}
            </Banner>
          )}
        </section>

        <section class="mp-card mp-settings__card" aria-labelledby="st-backup">
          <h2 class="mp-card__title" id="st-backup">
            {t("admin.settings.backups")}
          </h2>
          {(["d1", "gpkg"] as const).map((kind) => {
            const info = data.backups[kind];
            return (
              <div key={kind} class="mp-spot__by mp-settings__backup">
                <Icon name={kind === "d1" ? "database" : "map"} />
                <div class="mp-settings__backuptext">
                  <span class="mp-spot__by-label">{t(`admin.settings.backup.${kind}`)}</span>
                  <span class="mp-spot__by-names">{info ? t("admin.settings.backupLast", { ago: formatAgo(info.uploaded), size: formatBytes(info.size) }) : t("admin.settings.noBackup")}</span>
                </div>
                <Button size="sm" variant="secondary" icon="download" loading={downloading === kind} disabled={!info || downloading !== null} onClick={() => void download(kind)}>
                  {t("admin.settings.download")}
                </Button>
              </div>
            );
          })}
          <span class="mp-field__hint">{t("admin.settings.backupHint")}</span>
        </section>

        <section class="mp-card mp-settings__card" aria-labelledby="st-lang">
          <h2 class="mp-card__title" id="st-lang">
            {t("admin.settings.lang")}
          </h2>
          <Segmented<Lang>
            labelledBy="st-lang"
            class="mp-settings__seg"
            value={lang}
            onChange={(v) => void save({ default_lang: v }, t("admin.settings.langSaved"), "lang")}
            options={[
              { value: "es", label: "ES" },
              { value: "en", label: "EN" },
            ]}
          />
          <span class="mp-field__hint">{t("admin.settings.langHint")}</span>
        </section>

        <section class="mp-card mp-settings__card" aria-labelledby="st-features">
          <h2 class="mp-card__title" id="st-features">
            {t("admin.settings.features")}
          </h2>
          {FEATURES.map((f) => {
            const labelId = `ff-${f.key}`;
            return (
              <div key={f.key} class="mp-switchrow mp-settings__feature">
                <div class="mp-switchrow__text">
                  <b id={labelId}>{t(f.label)}</b>
                  <span>{t(f.hint)}</span>
                </div>
                <Segmented<FeatureFlag>
                  labelledBy={labelId}
                  class="mp-settings__flag"
                  value={asFlag(s[`feature_${f.key}`])}
                  onChange={(v) => void save({ [`feature_${f.key}`]: v } as SettingsPatch, t("admin.settings.featureSaved", { name: t(f.label), state: t(`admin.settings.flag.${v}`) }), f.key)}
                  options={[
                    { value: "off", label: t("admin.settings.flag.off"), disabled: saving === f.key },
                    { value: "admin", label: t("admin.settings.flag.admin"), disabled: saving === f.key },
                    { value: "on", label: t("admin.settings.flag.on"), disabled: saving === f.key },
                  ]}
                />
              </div>
            );
          })}
          <span class="mp-field__hint">{t("admin.settings.featuresHint")}</span>
        </section>

        <section class="mp-card mp-settings__card" aria-labelledby="st-map">
          <h2 class="mp-card__title" id="st-map">
            {t("admin.settings.map")}
          </h2>
          <form
            class="mp-settings__form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveMapUrl();
            }}
          >
            <TextField
              label={t("admin.settings.mapUrl")}
              mono
              type="url"
              value={mapUrl}
              error={mapError || undefined}
              hint={t("admin.settings.mapHint")}
              onInput={(e) => {
                setMapUrl((e.currentTarget as HTMLInputElement).value);
                setMapError("");
              }}
            />
            <div class="mp-settings__row">
              <Button type="submit" variant="secondary" icon="check" loading={saving === "map"} disabled={mapUrl.trim() === (s.map_style_url ?? DEFAULT_STYLE_URL)}>
                {t("common.action.save")}
              </Button>
              <Button variant="quiet" icon="rotate" disabled={mapUrl === DEFAULT_STYLE_URL && (s.map_style_url ?? DEFAULT_STYLE_URL) === DEFAULT_STYLE_URL} onClick={() => { setMapUrl(DEFAULT_STYLE_URL); setMapError(""); void save({ map_style_url: DEFAULT_STYLE_URL }, t("admin.settings.mapSaved"), "map"); }}>
                {t("admin.settings.mapReset")}
              </Button>
            </div>
          </form>
        </section>

        <section class="mp-card mp-settings__card mp-settings__wide" aria-labelledby="st-audit">
          <h2 class="mp-card__title" id="st-audit">
            {t("admin.settings.audit")}
          </h2>
          <span class="mp-field__hint">{t("admin.settings.auditHint")}</span>
          {audit === null ? (
            <Button variant="secondary" icon="history" onClick={() => void loadAudit()} class="mp-settings__auditbtn">
              {t("admin.settings.auditShow")}
            </Button>
          ) : audit.length === 0 ? (
            <span class="mp-field__hint">{t("admin.settings.auditNone")}</span>
          ) : (
            <div class="mp-admin-tablewrap">
              <table class="mp-table">
                <caption class="mp-sr">{t("admin.settings.audit")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("admin.settings.auditWhen")}</th>
                    <th scope="col">{t("admin.settings.auditWho")}</th>
                    <th scope="col">{t("admin.settings.auditWhat")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td class="mp-num">{formatAgo(a.at)}</td>
                      <td>{a.actor.replace(/^admin:/, "")}</td>
                      <td>
                        <code>{a.action}</code> <span class="mp-admin-muted">{a.entity} {a.entity_id ?? ""}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
