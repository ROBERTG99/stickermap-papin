import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AppHeader } from "../components/AppHeader";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { TypeGrid } from "../components/Chip";
import { ConfirmDialog, Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { TextAreaField, SwitchRow } from "../components/Field";
import { Icon } from "../components/Icon";
import { LocationBadge } from "../components/LocationPicker";
import { StickerCard } from "../components/StickerCard";
import { Skeleton } from "../components/Skeleton";
import { loadRecentPlacers, validateWhoPlaced, WhoPlaced, type WhoPlacedValue } from "../components/WhoPlaced";
import { LocationMap } from "../add/LocationMap";
import { buildPatch, NOTE_MAX, OTHER_TEXT_MAX, type EditSnapshot } from "../add/logic";
import { AddStyles } from "../add/styles";
import { ApiError, api } from "../lib/api";
import { formatRemaining } from "../lib/format";
import { t } from "../lib/i18n";
import { editGrants } from "../lib/local";
import { isDesktop } from "../lib/media";
import { navigate } from "../lib/router";
import { loadSpots, people, types as typeList } from "../lib/store";
import { toast } from "../lib/toast";
import type { SpotDetail } from "../shared/types";

function initialWho(spot: SpotDetail): WhoPlacedValue {
  if (spot.placer_status === "self") return { status: "self", placers: spot.reporter ? [spot.reporter] : [] };
  if (spot.placer_status === "other") return { status: "other", placers: spot.placers };
  return { status: "unknown", placers: [], note: spot.placer_note ?? undefined };
}

function snapshotOf(spot: SpotDetail): EditSnapshot {
  return {
    lat: spot.lat, lng: spot.lng, approximate: spot.is_approximate, types: spot.types, otherText: spot.other_text ?? "", note: spot.note ?? "",
    placerStatus: spot.placer_status, placers: spot.placer_status === "other" ? spot.placers : [], placerNote: spot.placer_note ?? "",
  };
}

/** Why a save or delete failed, in words that say what to do next. */
function failureMessage(error: unknown): string {
  const e = error instanceof ApiError ? error : new ApiError(0, "offline");
  if (e.status === 0) return t("add.error.network");
  if (e.status === 403 || e.status === 401) return t("add.edit.error.forbidden");
  if (e.status === 404) return t("add.edit.error.gone");
  if (e.status === 400) return t("add.edit.error.invalid");
  return t("add.edit.error.server");
}

function EditForm({ spot, token }: { spot: SpotDetail; token: string }) {
  const before = useMemo(() => snapshotOf(spot), [spot]);
  const [types, setTypes] = useState<string[]>(spot.types);
  const [otherText, setOtherText] = useState(spot.other_text ?? "");
  const [who, setWho] = useState<WhoPlacedValue>(() => initialWho(spot));
  const [note, setNote] = useState(spot.note ?? "");
  const [approximate, setApproximate] = useState(spot.is_approximate);
  const [pin, setPin] = useState({ lat: spot.lat, lng: spot.lng });
  const [moved, setMoved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [help, setHelp] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const desktop = isDesktop.value;
  const key = `spot:${spot.id}`;
  const started = useRef(Date.now());
  const remaining = editGrants.remainingMs(key) - (now - started.current);
  const expired = remaining <= 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const textSelected = types.some((slug) => typeList.value.find((x) => x.slug === slug)?.allows_text);
  const whoError = attempted ? validateWhoPlaced(who) : null;
  const typesError = attempted && types.length === 0;
  const blocked = types.length === 0 || !!validateWhoPlaced(who);

  const after: EditSnapshot = {
    lat: pin.lat, lng: pin.lng, approximate, types, otherText, note, placerStatus: who.status,
    placers: who.status === "other" ? who.placers : [], placerNote: who.note ?? "",
  };

  async function save() {
    if (blocked) {
      setAttempted(true);
      return;
    }
    const patch = buildPatch(before, after, textSelected);
    if (Object.keys(patch).length === 0) {
      toast.show({ message: t("add.edit.nothing") });
      return;
    }
    setSaving(true);
    try {
      await api.patchSpot(spot.id, token, patch);
      toast.show({ message: t("add.edit.saved"), kind: "success" });
      void loadSpots();
      navigate(`/s/${spot.id}`);
    } catch (error) {
      toast.show({ message: failureMessage(error), kind: "error", action: { label: t("add.common.retry"), onClick: () => void save() } });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api.deleteSpot(spot.id, token);
      setConfirmDelete(false);
      toast.show({ message: t("add.edit.deleted"), kind: "success" });
      void loadSpots();
      navigate("/");
    } catch (error) {
      setConfirmDelete(false);
      toast.show({ message: failureMessage(error), kind: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const photo = spot.thumb ?? spot.photo;
  const banner = expired ? (
    <Banner kind="error">{t("add.edit.expired")}</Banner>
  ) : (
    <Banner kind="countdown">{t("add.thanks.editFor")} <b>{formatRemaining(remaining)}</b></Banner>
  );

  const bar = (
    <div class="mp-submitbar">
      <div class="add__submit-wrap edit__bar">
        <Button variant="primary" size="lg" block loading={saving} aria-disabled={expired ? "true" : undefined} onClick={() => (expired ? undefined : void save())}>
          {t("add.edit.save")}
        </Button>
        <Button variant="danger-ghost" icon="trash" disabled={expired || deleting} onClick={() => setConfirmDelete(true)}>
          {t("add.edit.delete")}
        </Button>
      </div>
    </div>
  );

  const cards = (
    <div class="add__cards">
      <StickerCard step={1} title={t("add.photo.title")} state="done">
        {photo ? (
          <div class="add-photo">
            <div class="add-photo__thumb">
              <div class="mp-photo" role="img" aria-label={t("add.photo.alt")}><img src={photo} alt="" /></div>
            </div>
            <p class="mp-field__hint" style={{ margin: 0 }}>{t("add.edit.photoLocked")}</p>
          </div>
        ) : (
          <p class="mp-field__hint" style={{ margin: 0 }}>{t("add.edit.noPhoto")}</p>
        )}
      </StickerCard>

      <StickerCard step={2} title={t("add.location.title")} state="done">
        <div class="edit-loc">
          <LocationMap
            pin={pin}
            fallback={{ lat: spot.lat, lng: spot.lng, zoom: 16 }}
            focus={null}
            onPick={(lat, lng) => { setPin({ lat, lng }); setMoved(true); }}
          />
        </div>
        <div class="mp-chips" style={{ margin: "var(--space-3) 0" }} role="status">
          <LocationBadge source={moved ? "pin" : spot.location_source} accuracyM={moved ? null : spot.location_accuracy_m} />
          {moved && (
            <Button variant="quiet" size="sm" icon="rotate" onClick={() => { setPin({ lat: spot.lat, lng: spot.lng }); setMoved(false); }}>
              {t("add.edit.revertPin")}
            </Button>
          )}
        </div>
        <span class="mp-field__hint">{t("add.edit.pinHint")}</span>
        <SwitchRow label={t("add.edit.approx")} description={t("add.edit.approxHint")} checked={approximate} onChange={setApproximate} />
      </StickerCard>

      <StickerCard step={3} title={t("add.what.title")} state={blocked ? (attempted ? "invalid" : "default") : "done"} status={t("add.status.missing")}>
        {typesError && (
          <div class="mp-field__error" role="alert" style={{ marginBottom: "var(--space-3)" }}>
            <Icon name="alert" />
            {t("add.what.typeError")}
          </div>
        )}
        <TypeGrid
          types={typeList.value}
          value={types}
          onChange={setTypes}
          otherText={otherText}
          onOtherTextChange={(text) => setOtherText(text.slice(0, OTHER_TEXT_MAX))}
          label={t("add.what.group")}
        />
        <div class="add-what">
          <div class="add-flat">
            <WhoPlaced value={who} onChange={setWho} soy={spot.reporter ?? ""} people={people.value} recent={loadRecentPlacers()} error={whoError} />
          </div>
          <TextAreaField
            label={t("add.what.note")}
            value={note}
            maxLength={NOTE_MAX}
            placeholder={t("add.what.notePlaceholder")}
            onInput={(e) => setNote(e.currentTarget.value)}
          />
        </div>
      </StickerCard>
    </div>
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title={t("add.edit.confirmTitle")}
        body={t("add.edit.confirmBody")}
        confirmLabel={deleting ? t("add.edit.deleting") : t("add.edit.delete")}
        cancelLabel={t("add.edit.keep")}
        danger
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
      <Dialog
        open={help}
        title={t("add.edit.helpTitle")}
        onClose={() => setHelp(false)}
        actions={<Button variant="primary" onClick={() => setHelp(false)}>{t("add.help.ok")}</Button>}
      >
        <p class="mp-dialog__body">{t("add.edit.helpBody")}</p>
      </Dialog>
    </>
  );

  return (
    <div class={`add${desktop ? " edit--desktop" : ""}`}>
      <AddStyles />
      {desktop
        ? <AppHeader variant="desktop" active="map" search={<></>} />
        : <AppHeader variant="bar" title={t("add.edit.title")} onClose={() => navigate(`/s/${spot.id}`)} onHelp={() => setHelp(true)} />}
      <div class="add__scroll">
        <div class="edit__banner">{banner}</div>
        {cards}
      </div>
      {bar}
      {dialogs}
    </div>
  );
}

/** `/editar/:id`: edit or delete your own sticker for 24 h, only with the grant saved on this device. */
export default function EditPage({ id }: { id: string }) {
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "offline">("loading");
  const [help, setHelp] = useState(false);
  const grant = editGrants.get(`spot:${id}`);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    api.spot(id)
      .then((s) => { if (alive) { setSpot(s); setStatus("ready"); } })
      .catch((error) => { if (alive) setStatus(error instanceof ApiError && error.status === 404 ? "missing" : "offline"); });
    return () => { alive = false; };
  }, [id]);

  if (status === "ready" && spot && grant) return <EditForm key={id} spot={spot} token={grant.token} />;

  return (
    <div class="add">
      <AddStyles />
      <AppHeader variant="bar" title={t("add.edit.title")} onClose={() => navigate(status === "missing" ? "/" : `/s/${id}`)} onHelp={() => setHelp(true)} />
      <div class="add__scroll">
        <div class="edit__state">
          {status === "loading" && <div style={{ width: "100%", maxWidth: "420px" }}><Skeleton height={240} /></div>}
          {status === "missing" && (
            <EmptyState icon="/img/icons/papa.png" title={t("add.common.notFound")} body={t("add.edit.missingBody")} action={{ label: t("add.edit.toMap"), href: "/" }} />
          )}
          {status === "offline" && (
            <EmptyState icon="/img/icons/papa.png" title={t("add.edit.offlineTitle")} body={t("add.error.network")} action={{ label: t("add.common.retry"), onClick: () => location.reload() }} />
          )}
          {status === "ready" && !grant && (
            <EmptyState icon="/img/icons/papa.png" title={t("add.edit.noGrantTitle")} body={t("add.edit.noGrantBody")} action={{ label: t("add.edit.seeOnMap"), href: `/s/${id}` }} />
          )}
        </div>
      </div>
      <Dialog
        open={help}
        title={t("add.edit.helpTitle")}
        onClose={() => setHelp(false)}
        actions={<Button variant="primary" onClick={() => setHelp(false)}>{t("add.help.ok")}</Button>}
      >
        <p class="mp-dialog__body">{t("add.edit.helpBody")}</p>
      </Dialog>
    </div>
  );
}
