import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { recordStickerAdded } from "../lib/pwa";
import { toast } from "../lib/toast";
import { ApiError, api } from "../lib/api";
import { parseLocationText } from "../lib/geo-parse";
import { formatCoords } from "../lib/format";
import { pendingFiles } from "../lib/handoff";
import { t } from "../lib/i18n";
import { editGrants, lastPerson, storage } from "../lib/local";
import { navigate } from "../lib/router";
import { config, loadSpots, types as typeList } from "../lib/store";
import { getTurnstileToken } from "../lib/turnstile";
import { processPhoto } from "../lib/photo";
import { readExifFixed } from "./exif";
import type { SearchResult } from "../components/LocationPicker";
import { lastCreated } from "./created";
import { DeviceError, getDeviceFix } from "./device";
import { clearDraft, loadDraft, saveDraft, type AddDraft } from "./draft-store";
import { placeNameAt, searchPlaces } from "./geocode";
import {
  buildMeta, checkPhotoFile, classifySubmitError, distanceKm, isLocationConflict, keepsDraft, photoMime, planLocation, validateAdd,
  type LocationChoice, type SubmitErrorKind,
} from "./logic";
import { derivativeName, rotatePhoto } from "./photo-tools";
import type { AddState, PhotoState } from "./state";

const FALLBACK_VIEW = { lat: -34.9, lng: -56.16, zoom: 11 };

/** Where the empty pin waits: the last place a sticker was sent from, else Montevideo. */
export function fallbackView(): { lat: number; lng: number; zoom: number } {
  const last = storage.get<{ lat: number; lng: number } | null>("lastLocation", null);
  return last && Number.isFinite(last.lat) && Number.isFinite(last.lng) ? { lat: last.lat, lng: last.lng, zoom: 14 } : FALLBACK_VIEW;
}

function initialState(): AddState {
  const soy = lastPerson.get();
  return {
    photo: null, photoError: null,
    choice: null, revert: null, exif: null, device: null, resolving: false, denied: false, conflict: null,
    results: [], paste: null, pasteError: null, focus: null, approximate: false,
    types: [], otherText: "", soy, note: "", noteOpen: false,
    attempted: false, phase: "idle", progress: 0, error: null,
    duplicate: null, duplicateStage: "closed", addingHere: false, restored: false,
  };
}

const manual = (c: LocationChoice | null) => !!c && (c.source === "pin" || c.source === "search" || c.source === "paste");
const revoke = (p: PhotoState | null) => { if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl); };

/** A fresh photo needs the user to look at it again before the next one is judged. */
const focusOf = (cur: AddState, lat: number, lng: number, zoom: number) => ({ lat, lng, zoom, nonce: (cur.focus?.nonce ?? 0) + 1 });

export type AddForm = ReturnType<typeof useAddForm>;

/** All the state and actions of `/nuevo`. Every async step checks that it is still the current one before writing. */
export function useAddForm() {
  const [s, setS] = useState<AddState>(initialState);
  const ref = useRef(s);
  ref.current = s;
  const patch = useCallback((p: Partial<AddState> | ((cur: AddState) => Partial<AddState>)) => {
    setS((cur) => {
      const next = { ...cur, ...(typeof p === "function" ? p(cur) : p) };
      ref.current = next;
      return next;
    });
  }, []);

  const photoToken = useRef(0);
  const deviceToken = useRef(0);
  const searchAbort = useRef<AbortController | undefined>(undefined);
  const draftActive = useRef(false);

  // ── location ──────────────────────────────────────────────────────────

  const requestDevice = useCallback(async (auto: boolean) => {
    const token = ++deviceToken.current;
    patch({ resolving: true, denied: false });
    try {
      const fix = await getDeviceFix();
      if (token !== deviceToken.current) return;
      const { exif } = ref.current;
      if (exif && isLocationConflict(exif, fix)) {
        patch({ resolving: false, device: fix, conflict: { exifName: formatCoords(exif.lat, exif.lng), deviceName: formatCoords(fix.lat, fix.lng), km: distanceKm(exif, fix) } });
        void Promise.all([placeNameAt(exif.lat, exif.lng), placeNameAt(fix.lat, fix.lng)]).then(([exifName, deviceName]) =>
          patch((cur) => (cur.conflict ? { conflict: { ...cur.conflict, exifName, deviceName } } : {})));
        return;
      }
      patch((cur) => ({
        resolving: false, device: fix, conflict: null, revert: null,
        choice: { lat: fix.lat, lng: fix.lng, source: "device", accuracyM: fix.accuracyM },
        focus: focusOf(cur, fix.lat, fix.lng, fix.accuracyM > 100 ? 16 : 18),
      }));
    } catch (error) {
      if (token !== deviceToken.current) return;
      const kind = error instanceof DeviceError ? error.kind : "unavailable";
      patch({ resolving: false, denied: kind === "denied" });
      if (kind !== "denied") toast.show({ message: t(auto ? "add.location.deviceFailedAuto" : "add.location.deviceFailed") });
    }
  }, [patch]);

  const setPin = useCallback((lat: number, lng: number) => {
    deviceToken.current++; // a late device fix must not move a pin the user just placed
    patch((cur) => ({
      choice: { lat, lng, source: "pin", accuracyM: null },
      revert: cur.choice && cur.choice.source !== "pin" ? cur.choice : cur.revert,
      conflict: null, resolving: false,
    }));
  }, [patch]);

  const revertPin = useCallback(() => {
    patch((cur) => (cur.revert ? { choice: cur.revert, revert: null, focus: focusOf(cur, cur.revert.lat, cur.revert.lng, 17) } : {}));
  }, [patch]);

  const search = useCallback(async (query: string) => {
    searchAbort.current?.abort();
    if (!query) {
      patch({ results: [] });
      return;
    }
    const ctl = new AbortController();
    searchAbort.current = ctl;
    try {
      const results = await searchPlaces(query, ctl.signal);
      if (!ctl.signal.aborted) patch({ results });
    } catch {
      if (!ctl.signal.aborted) {
        patch({ results: [] });
        toast.show({ message: t("add.location.searchFailed") });
      }
    }
  }, [patch]);

  const pickResult = useCallback((result: SearchResult) => {
    const place = ref.current.results.find((p) => p.id === result.id);
    if (!place) return;
    deviceToken.current++;
    patch((cur) => ({
      choice: { lat: place.lat, lng: place.lng, source: "search", accuracyM: null },
      revert: null, conflict: null, results: [], resolving: false,
      focus: focusOf(cur, place.lat, place.lng, place.zoom),
    }));
  }, [patch]);

  const pasteText = useCallback((text: string) => {
    const parsed = parseLocationText(text);
    if (!parsed.ok) {
      patch({ pasteError: t(`add.location.paste.${parsed.reason}`) });
      return;
    }
    deviceToken.current++;
    patch((cur) => ({
      choice: { lat: parsed.lat, lng: parsed.lng, source: "paste", accuracyM: null },
      revert: null, conflict: null, resolving: false, pasteError: null,
      paste: { text, coords: formatCoords(parsed.lat, parsed.lng) },
      focus: focusOf(cur, parsed.lat, parsed.lng, parsed.zoom ?? 17),
    }));
  }, [patch]);

  const pickConflict = useCallback((which: "exif" | "device") => {
    patch((cur) => {
      const from = which === "exif" ? cur.exif : cur.device;
      if (!from) return { conflict: null };
      const accuracyM = "accuracyM" in from ? from.accuracyM : null;
      return {
        conflict: null, revert: null,
        choice: { lat: from.lat, lng: from.lng, source: which, accuracyM },
        focus: focusOf(cur, from.lat, from.lng, which === "exif" ? 17 : 16),
      };
    });
  }, [patch]);

  // ── photo ─────────────────────────────────────────────────────────────

  const lookUpDuplicate = useCallback(async (sha256: string, token: number) => {
    try {
      const { id } = await api.exists(sha256);
      if (token !== photoToken.current) return;
      patch({ duplicate: { id, spot: null }, duplicateStage: "ask" });
      const spot = await api.spot(id).catch(() => null);
      if (token === photoToken.current && spot) patch((cur) => (cur.duplicate?.id === id ? { duplicate: { id, spot } } : {}));
    } catch {
      /* 404 = new photo; offline = the server checks again on send */
    }
  }, [patch]);

  const pickFile = useCallback(async (file: File, viaCamera: boolean) => {
    const check = checkPhotoFile(file);
    if (!check.ok) {
      patch({ photoError: check.reason });
      return;
    }
    const token = ++photoToken.current;
    revoke(ref.current.photo);
    const heic = check.mime === "image/heic" || check.mime === "image/heif";
    patch({
      photo: { file, viaCamera, status: "processing", processed: null, previewUrl: heic ? null : URL.createObjectURL(file), keepAnyway: false, rotating: false },
      photoError: null, duplicate: null, duplicateStage: "closed",
    });
    let processed;
    try {
      processed = await processPhoto(file);
      const exif = await readExifFixed(file); // see exif.ts: the shared reader returns nothing for every file
      if (exif && (exif.lat !== null || exif.takenAt)) processed = { ...processed, exif };
    } catch {
      if (token !== photoToken.current) return;
      revoke(ref.current.photo);
      patch({ photo: null, photoError: "unreadable" });
      return;
    }
    if (token !== photoToken.current) return;
    const display = processed.display ? URL.createObjectURL(processed.display.blob) : null;
    const previous = ref.current.photo;
    if (display) revoke(previous);
    patch((cur) => ({ photo: cur.photo ? { ...cur.photo, status: "ready", processed, previewUrl: display ?? cur.photo.previewUrl } : null }));

    // where does the pin go? (BUILD.md §7.3: photo GPS, then device for a fresh camera photo, never for a gallery photo)
    const { lat, lng, accuracyM, takenAt } = processed.exif;
    const hasGps = lat !== null && lng !== null;
    const plan = planLocation({ hasGps, viaCamera, takenAt });
    if (plan === "exif" && hasGps) {
      deviceToken.current++;
      patch((cur) => ({
        exif: { lat, lng, accuracyM }, conflict: null, revert: null, resolving: false, denied: false,
        choice: { lat, lng, source: "exif", accuracyM },
        focus: focusOf(cur, lat, lng, 17),
      }));
    } else {
      // a location read from the previous photo does not carry over to this one
      patch((cur) => ({ exif: null, choice: cur.choice?.source === "exif" ? null : cur.choice }));
      if (plan === "device" && !manual(ref.current.choice)) void requestDevice(true);
    }
    void lookUpDuplicate(processed.sha256, token);
  }, [patch, lookUpDuplicate, requestDevice]);

  /** Files from the camera input (one) or the gallery input (one or many; many go to the bulk page). */
  const pickFiles = useCallback((files: File[], viaCamera: boolean) => {
    if (files.length === 0) return;
    if (files.length > 1) {
      pendingFiles.value = files;
      navigate("/nuevo/varias");
      return;
    }
    void pickFile(files[0]!, viaCamera);
  }, [pickFile]);

  const removePhoto = useCallback(() => {
    photoToken.current++;
    revoke(ref.current.photo);
    patch((cur) => ({
      photo: null, photoError: null, duplicate: null, duplicateStage: "closed",
      // the location that came from this photo goes with it; anything the user set stays
      exif: null, choice: cur.choice?.source === "exif" ? null : cur.choice,
    }));
  }, [patch]);

  const rotate = useCallback(async () => {
    const photo = ref.current.photo;
    if (!photo?.processed?.display || photo.rotating) return;
    patch((cur) => (cur.photo ? { photo: { ...cur.photo, rotating: true } } : {}));
    try {
      const processed = await rotatePhoto(photo.processed);
      if (ref.current.photo?.file !== photo.file) return;
      const url = processed.display ? URL.createObjectURL(processed.display.blob) : photo.previewUrl;
      revoke(photo);
      patch((cur) => (cur.photo ? { photo: { ...cur.photo, processed, previewUrl: url, rotating: false } } : {}));
    } catch {
      patch((cur) => (cur.photo ? { photo: { ...cur.photo, rotating: false } } : {}));
      toast.show({ message: t("add.photo.rotateFailed") });
    }
  }, [patch]);

  const dismissDuplicate = useCallback((keepAnyway: boolean) => {
    patch((cur) => ({ duplicateStage: "closed", photo: cur.photo && keepAnyway ? { ...cur.photo, keepAnyway: true } : cur.photo }));
  }, [patch]);

  // ── what / who (the person who uploads is the one who stuck it) ───────

  const setSoy = useCallback((soy: string) => {
    patch({ soy });
  }, [patch]);

  // ── derived ───────────────────────────────────────────────────────────

  const textSlugs = useMemo(() => new Set(typeList.value.filter((x) => x.allows_text).map((x) => x.slug)), [typeList.value]);
  const hasTextType = s.types.some((slug) => textSlugs.has(slug));

  const issues = validateAdd({
    photoBusy: s.photo?.status === "processing",
    location: s.choice,
    locationBusy: false,
    types: s.types,
  });

  // ── draft ─────────────────────────────────────────────────────────────

  const snapshot = useCallback((cur: AddState): AddDraft => ({
    v: 1, savedAt: Date.now(),
    photo: cur.photo?.processed
      ? { file: cur.photo.file, viaCamera: cur.photo.viaCamera, keepAnyway: cur.photo.keepAnyway, sha256: cur.photo.processed.sha256, exif: cur.photo.processed.exif,
          display: cur.photo.processed.display, thumb: cur.photo.processed.thumb, decoded: cur.photo.processed.decoded }
      : null,
    choice: cur.choice, exif: cur.exif, approximate: cur.approximate, types: cur.types, otherText: cur.otherText,
    soy: cur.soy, note: cur.note,
  }), []);

  // Restore an unsent sticker (a failed upload from an earlier visit).
  useEffect(() => {
    let alive = true;
    void loadDraft().then((draft) => {
      if (!alive || !draft || ref.current.photo || ref.current.choice || ref.current.types.length) return;
      draftActive.current = true;
      const photo: PhotoState | null = draft.photo
        ? {
            file: draft.photo.file, viaCamera: draft.photo.viaCamera, status: "ready", keepAnyway: draft.photo.keepAnyway, rotating: false,
            processed: { sha256: draft.photo.sha256, exif: draft.photo.exif, display: draft.photo.display, thumb: draft.photo.thumb, decoded: draft.photo.decoded },
            previewUrl: draft.photo.display ? URL.createObjectURL(draft.photo.display.blob) : photoMime(draft.photo.file) === "image/heic" ? null : URL.createObjectURL(draft.photo.file),
          }
        : null;
      patch((cur) => ({
        photo, choice: draft.choice, exif: draft.exif, approximate: draft.approximate, types: draft.types, otherText: draft.otherText,
        soy: draft.soy || cur.soy, note: draft.note, noteOpen: !!draft.note, restored: true,
        focus: draft.choice ? focusOf(cur, draft.choice.lat, draft.choice.lng, 17) : null,
      }));
    });
    return () => { alive = false; };
  }, [patch]);

  // Keep the draft in step with later edits once one exists (after a failed upload or a restore).
  useEffect(() => {
    if (!draftActive.current) return;
    const id = window.setTimeout(() => { void saveDraft(snapshot(ref.current)); }, 700);
    return () => window.clearTimeout(id);
  }, [s.photo?.processed, s.choice, s.approximate, s.types, s.otherText, s.soy, s.note, snapshot]);

  const discardDraft = useCallback(() => {
    draftActive.current = false;
    void clearDraft();
    photoToken.current++;
    revoke(ref.current.photo);
    patch({ ...initialState(), soy: ref.current.soy });
  }, [patch]);

  useEffect(() => () => revoke(ref.current.photo), []);

  // ── submit ────────────────────────────────────────────────────────────

  const turnstile = useCallback(async (): Promise<string> => {
    const sitekey = config.value?.turnstile_sitekey ?? (await api.config()).turnstile_sitekey;
    try {
      return await getTurnstileToken(sitekey);
    } catch {
      throw new ApiError(navigator.onLine ? 403 : 0, navigator.onLine ? "turnstile_failed" : "offline");
    }
  }, []);

  const fail = useCallback((kind: SubmitErrorKind, duplicateId?: string) => {
    if (kind === "exists" && duplicateId) {
      patch({ phase: "idle", progress: 0, error: null, duplicate: { id: duplicateId, spot: null }, duplicateStage: "ask" });
      void api.spot(duplicateId).then((spot) => patch((cur) => (cur.duplicate?.id === duplicateId ? { duplicate: { id: duplicateId, spot } } : {}))).catch(() => undefined);
      return;
    }
    patch({ phase: "failed", progress: 0, error: kind });
    if (keepsDraft(kind)) {
      draftActive.current = true;
      void saveDraft(snapshot(ref.current));
    }
  }, [patch, snapshot]);

  const submit = useCallback(async () => {
    const cur = ref.current;
    if (cur.phase === "uploading" || !cur.choice || validateAdd({ photoBusy: cur.photo?.status === "processing", location: cur.choice, locationBusy: false, types: cur.types }).length) return;
    patch({ phase: "uploading", progress: 0, error: null });
    try {
      const token = await turnstile();
      const meta = buildMeta({
        location: cur.choice, approximate: cur.approximate, types: cur.types,
        otherText: cur.types.some((slug) => textSlugs.has(slug)) ? cur.otherText : "",
        soy: cur.soy, note: cur.note,
        takenAt: cur.photo?.processed?.exif.takenAt ?? null,
        photoSha256: cur.photo && !cur.photo.keepAnyway ? (cur.photo.processed?.sha256 ?? null) : null,
        turnstileToken: token,
      });
      const form = new FormData();
      form.set("meta", JSON.stringify(meta));
      const processed = cur.photo?.processed;
      if (processed?.display && processed.thumb) {
        form.set("display", processed.display.blob, derivativeName("display", processed.display.blob));
        form.set("thumb", processed.thumb.blob, derivativeName("thumb", processed.thumb.blob));
      }
      // The original goes along when it is an accepted format (the server sniffs it again); a "different place" photo skips it so the hash check does not refuse it.
      if (cur.photo && !cur.photo.keepAnyway && photoMime(cur.photo.file)) form.set("original", cur.photo.file, cur.photo.file.name || "original");

      const created = await api.createSpot(form, { onProgress: (f) => patch({ progress: Math.min(99, Math.round(f * 100)) }) });
      if (created.editToken) editGrants.save(`spot:${created.id}`, created.editToken);
      if (cur.soy.trim()) lastPerson.set(cur.soy);
      storage.set("lastLocation", { lat: cur.choice.lat, lng: cur.choice.lng });
      lastCreated.value = {
        id: created.id, types: cur.types, lat: meta.lat, lng: meta.lng,
        photoUrl: processed?.display ? URL.createObjectURL(processed.display.blob) : null,
      };
      draftActive.current = false;
      await clearDraft();
      void loadSpots();
      recordStickerAdded();
      navigate(`/gracias/${created.id}`);
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(0, "offline");
      const duplicateId = (e.body as { id?: string } | null | undefined)?.id;
      fail(classifySubmitError(e.status, e.code), duplicateId);
    }
  }, [patch, turnstile, textSlugs, fail]);

  /** "Agregar sticker a ese lugar": the types of this form go to the spot that already has the photo. */
  const addToExisting = useCallback(async () => {
    const cur = ref.current;
    const target = cur.duplicate;
    if (!target || cur.addingHere || cur.types.length === 0) return;
    patch({ addingHere: true });
    try {
      const token = await turnstile();
      await api.addTypes(target.id, {
        types: cur.types,
        other_text: cur.types.some((slug) => textSlugs.has(slug)) ? cur.otherText.trim() || null : null,
        reporter: cur.soy.trim() || null,
        turnstile_token: token,
      });
      if (cur.soy.trim()) lastPerson.set(cur.soy);
      toast.show({ message: t("add.dup.added"), kind: "success" });
      void loadSpots();
      patch({ addingHere: false, duplicateStage: "closed" });
      navigate(`/s/${target.id}`);
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(0, "offline");
      const kind = classifySubmitError(e.status, e.code);
      patch({ addingHere: false });
      toast.show({ message: e.status === 404 ? t("add.dup.gone") : t(`add.error.${kind}`), kind: "error" });
    }
  }, [patch, turnstile, textSlugs]);

  return {
    s, issues, hasTextType, textSlugs,
    set: patch,
    actions: {
      requestDevice, setPin, revertPin, search, pickResult, pasteText, pickConflict,
      pickFiles, removePhoto, rotate, dismissDuplicate,
      setSoy, submit, addToExisting, discardDraft,
    },
  };
}
