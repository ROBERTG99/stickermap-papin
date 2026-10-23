/**
 * Bulk add controller (BUILD.md §7.3b): one module-level store so a read or an upload keeps going while the user moves around
 * the app. Phases: choose -> reading -> review -> uploading -> done. Everything but the signals below lives in IndexedDB
 * (`draft-idb.ts`), so a reload resumes.
 */
import { computed, signal } from "@preact/signals";
import { defaultWhoPlaced } from "../../components/WhoPlaced";
import { rememberPlacers } from "../../components/WhoPlaced";
import { api, ApiError } from "../../lib/api";
import { bulkReminder } from "../../lib/drafts";
import { takePendingFiles } from "../../lib/handoff";
import { t } from "../../lib/i18n";
import { editGrants, lastPerson, storage } from "../../lib/local";
import { config, typeBySlug } from "../../lib/store";
import { toast } from "../../lib/toast";
import { getTurnstileToken } from "../../lib/turnstile";
import { geocodeKey } from "../../shared/geo";
import { MAX } from "../../shared/schema";
import { newUlid } from "../../shared/ulid";
import { classifyMetas, effectiveCoords, isUploaded, summarizeDraft, type PhotoStatus } from "./classify";
import { deleteDraft, dropHeavyBlobs, getBlobs, getPhotos, getThumb, getThumbs, latestDraft, putDraft, putPhotos } from "./draft-idb";
import { batchProblem, buildSpotMeta, type BulkProblem } from "./effective";
import { cachedName, reverseName } from "./places";
import { isImageFile, readFiles } from "./read";
import { findSameGroups, naiveMs, type SameGroup } from "./same-sticker";
import type { BulkDefaults, BulkPhase, DraftMeta, PhotoMeta, PhotoOverride, PlacedLocation, ServerBatch } from "./types";
import { backoffMs, interpretUploadError, MAX_RETRIES, PARALLEL_UPLOADS } from "./upload";

// ── state ─────────────────────────────────────────────────────────────────

export const phase = signal<BulkPhase>("choose");
export const draft = signal<DraftMeta | null>(null);
export const photos = signal<PhotoMeta[]>([]);
export const thumbUrls = signal<ReadonlyMap<string, string>>(new Map());
export const readProgress = signal({ done: 0, total: 0 });
/** Upload progress (0-100) of the photos that are on the wire right now. */
export const busy = signal<ReadonlyMap<string, number>>(new Map());
export const uploadRunning = signal(false);
/** An unfinished draft found on disk, offered on the first screen. */
export const resumable = signal<{ draft: DraftMeta; photos: PhotoMeta[] } | null>(null);
/** "Elegí hasta 100 por vez" after trimming a bigger pick. */
export const overLimit = signal(false);
export const placeNames = signal<ReadonlyMap<string, string>>(new Map());
/** Review filter; the "Ubicarlas ahora" link of the last screen sets it to `noloc`. */
export const reviewFilter = signal<"all" | "ready" | "noloc" | "skipped">("all");

export interface Row {
  photo: PhotoMeta;
  /** 1-based position in the list (stable across filters). */
  number: number;
  status: PhotoStatus;
  /** For repeated photos: the number of the first copy. */
  sameAsNumber?: number;
}

const byTaken = (a: PhotoMeta, b: PhotoMeta): number => {
  const ta = naiveMs(a.takenAt);
  const tb = naiveMs(b.takenAt);
  if (ta !== null && tb !== null && ta !== tb) return ta - tb;
  if (ta === null && tb !== null) return 1;
  if (ta !== null && tb === null) return -1;
  return a.seq - b.seq;
};

/** Review list: photos not yet on the server, ordered by `taken_at` ascending. */
export const rows = computed<Row[]>(() => {
  const live = photos.value.filter((p) => !isUploaded(p));
  const classes = classifyMetas(live);
  const sorted = live.map((photo, i) => ({ photo, cls: classes[i]!, i })).sort((a, b) => byTaken(a.photo, b.photo));
  const numberOf = new Map(sorted.map((x, n) => [x.photo.id, n + 1]));
  return sorted.map((x, n) => ({
    photo: x.photo,
    number: n + 1,
    status: x.cls.status,
    sameAsNumber: x.cls.sameAs !== undefined ? numberOf.get(live[x.cls.sameAs]!.id) : undefined,
  }));
});

export const readyRows = computed(() => rows.value.filter((r) => r.status === "ready"));

export const counts = computed(() => {
  const c = { all: rows.value.length, ready: 0, noloc: 0, skipped: 0 };
  for (const r of rows.value) {
    if (r.status === "ready") c.ready++;
    else if (r.status === "no-location") c.noloc++;
    else c.skipped++;
  }
  return c;
});

/** Photos of the current send, ordered like the list. */
export const sendRows = computed(() => photos.value.filter((p) => p.upload.state !== "idle" && p.upload.send === draft.value?.sendNo).sort(byTaken));

export const uploadStats = computed(() => {
  const sent = sendRows.value;
  const done = sent.filter((p) => isUploaded(p)).length;
  const failed = sent.filter((p) => p.upload.state === "failed").length;
  return { total: sent.length, done, failed, created: sent.filter((p) => p.upload.state === "done").length };
});

export const defaults = computed<BulkDefaults | null>(() => draft.value?.defaults ?? null);

/** Same-sticker suggestions among the ready photos that were not dismissed. */
export const sameGroups = computed<SameGroup[]>(() => {
  const dismissed = new Set(draft.value?.dismissedSame ?? []);
  const points = readyRows.value.flatMap((r) => {
    const { lat, lng } = effectiveCoords(r.photo);
    return lat === null || lng === null ? [] : [{ id: r.photo.id, lat, lng, takenAt: r.photo.takenAt }];
  });
  return findSameGroups(points).filter((g) => !dismissed.has(g.key));
});

export const allowsText = (slug: string): boolean => typeBySlug.value.get(slug)?.allows_text === true;

/** Why "Mandale Mecha" is disabled, or null when the batch can go. */
export const problem = computed<BulkProblem | null>(() => {
  const d = defaults.value;
  return d ? batchProblem(d, readyRows.value.length, allowsText) : "type";
});

/** True when every readable photo came without a location (Android's picker redacts it). */
export const allWithoutLocation = computed(() => {
  const readable = rows.value.filter((r) => r.status !== "error");
  return readable.length > 0 && readable.every((r) => r.status === "no-location" || r.status === "exists" || r.status === "dup-batch") && readable.some((r) => r.status === "no-location");
});

/** Total size of the originals, for "Subir también los originales (≈ 180 MB)". */
export const originalsBytes = computed(() => readyRows.value.reduce((n, r) => n + (r.photo.hasOriginal ? r.photo.size : 0), 0));

export function placeLabel(p: PhotoMeta): string | null {
  const { lat, lng } = effectiveCoords(p);
  if (lat === null || lng === null) return null;
  return placeNames.value.get(geocodeKey(lat, lng)) ?? null;
}

// ── persistence ───────────────────────────────────────────────────────────

const dirty = new Set<string>();
let draftDirty = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

async function flush(): Promise<void> {
  clearTimeout(persistTimer);
  const d = draft.value;
  if (!d) return;
  const ids = new Set(dirty);
  dirty.clear();
  const writeDraft = draftDirty;
  draftDirty = false;
  try {
    if (writeDraft) await putDraft({ ...d, updatedAt: Date.now() });
    await putPhotos(d.id, photos.value.filter((p) => ids.has(p.id)));
  } catch {
    /* storage unavailable: the page keeps working in memory */
  }
}

function schedulePersist(): void {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void flush(), 200);
}

function touchDraft(patch: Partial<DraftMeta>): void {
  if (!draft.value) return;
  draft.value = { ...draft.value, ...patch };
  draftDirty = true;
  schedulePersist();
}

function patchPhoto(id: string, patch: (p: PhotoMeta) => PhotoMeta): void {
  photos.value = photos.value.map((p) => (p.id === id ? patch(p) : p));
  dirty.add(id);
  schedulePersist();
  updateReminder();
}

function patchPhotos(ids: ReadonlySet<string>, patch: (p: PhotoMeta) => PhotoMeta): void {
  photos.value = photos.value.map((p) => (ids.has(p.id) ? patch(p) : p));
  for (const id of ids) dirty.add(id);
  schedulePersist();
  updateReminder();
}

function updateReminder(): void {
  const d = draft.value;
  bulkReminder.value = d ? summarizeDraft(d.phase, photos.value, d.sendNo) : { unplaced: 0, unfinished: null };
}

/** For `src/App.tsx`: reads the draft summary from IndexedDB on page load so the map can announce it. Never throws. */
export async function refreshBulkReminder(): Promise<void> {
  if (draft.value) {
    updateReminder();
    return;
  }
  try {
    const d = await latestDraft();
    bulkReminder.value = d ? summarizeDraft(d.phase, await getPhotos(d.id), d.sendNo) : { unplaced: 0, unfinished: null };
  } catch {
    bulkReminder.value = { unplaced: 0, unfinished: null };
  }
}

function setPhase(next: Exclude<BulkPhase, "choose">): void {
  phase.value = next;
  touchDraft({ phase: next });
  void flush();
  updateReminder();
}

// ── thumbnails ────────────────────────────────────────────────────────────

function addThumb(id: string, blob: Blob): void {
  const next = new Map(thumbUrls.value);
  const old = next.get(id);
  if (old) URL.revokeObjectURL(old);
  next.set(id, URL.createObjectURL(blob));
  thumbUrls.value = next;
}

function clearThumbs(): void {
  for (const url of thumbUrls.value.values()) URL.revokeObjectURL(url);
  thumbUrls.value = new Map();
}

// ── start, resume, discard ────────────────────────────────────────────────

function initialDefaults(): BulkDefaults {
  const soy = lastPerson.get();
  const known = new Set(typeBySlug.value.keys());
  const saved = storage.get<string[]>("lastTypes", []);
  const lastTypes = known.size > 0 ? saved.filter((s) => known.has(s)) : saved;
  return { types: lastTypes, otherText: "", placer: defaultWhoPlaced(soy), soy, approximate: false, originals: true };
}

/** Throw away the draft in memory and on disk. Safe to call without one. */
export async function discardDraft(): Promise<void> {
  const d = draft.value;
  clearTimeout(persistTimer);
  dirty.clear();
  draftDirty = false;
  draft.value = null;
  photos.value = [];
  clearThumbs();
  busy.value = new Map();
  readProgress.value = { done: 0, total: 0 };
  resumable.value = null;
  reviewFilter.value = "all";
  phase.value = "choose";
  bulkReminder.value = { unplaced: 0, unfinished: null };
  if (d) {
    try { await deleteDraft(d.id); } catch { /* nothing to clean */ }
  }
}

/** Start a new batch from picked or dropped files; replaces any draft on disk. */
export async function startFiles(input: readonly File[]): Promise<void> {
  const images = input.filter(isImageFile);
  if (images.length === 0) return;
  if (phase.value === "reading" || phase.value === "uploading") return;
  let files = images;
  overLimit.value = images.length > MAX.batchSpots;
  if (overLimit.value) {
    files = images.slice(0, MAX.batchSpots);
    toast.show({ message: t("bulk.limit") });
  }
  const stale = await latestDraft().catch(() => null);
  await discardDraft();
  if (stale) await deleteDraft(stale.id).catch(() => undefined);

  const now = Date.now();
  draft.value = {
    id: newUlid(), createdAt: now, updatedAt: now, phase: "reading", total: files.length, existsChecked: false,
    defaults: initialDefaults(), dismissedSame: [], sendNo: 0, server: null, lastSend: null,
  };
  draftDirty = true;
  photos.value = [];
  readProgress.value = { done: 0, total: files.length };
  phase.value = "reading";
  await flush();

  const draftId = draft.value.id;
  await readFiles(draftId, files, {
    onPhoto: (meta, thumb) => {
      if (draft.value?.id !== draftId) return;
      photos.value = [...photos.value, meta].sort((a, b) => a.seq - b.seq);
      dirty.add(meta.id);
      if (thumb) addThumb(meta.id, thumb);
      schedulePersist();
    },
    onProgress: (done, total) => { readProgress.value = { done, total }; },
  });
  if (draft.value?.id !== draftId) return;
  await checkExisting();
  if (draft.value?.id !== draftId) return;
  setPhase("review");
  void resolveNames();
}

/** One call with every hash; the server answers with the spots that already have the photo. Failure is not fatal (uploads 409). */
async function checkExisting(): Promise<void> {
  const shas = [...new Set(photos.value.flatMap((p) => (p.sha256 && !p.error ? [p.sha256] : [])))].slice(0, MAX.batchSpots);
  if (shas.length === 0) return;
  try {
    const found = await api.existsMany(shas);
    photos.value = photos.value.map((p) => (p.sha256 && found[p.sha256] ? { ...p, existsId: found[p.sha256]! } : p));
    for (const p of photos.value) dirty.add(p.id);
    touchDraft({ existsChecked: true });
  } catch {
    touchDraft({ existsChecked: false });
  }
}

/** First screen: files handed over from `/nuevo` or the share target start straight away; otherwise look for a draft. */
export async function init(): Promise<void> {
  if (phase.value !== "choose") return;
  const pending = takePendingFiles();
  if (pending.length > 0) {
    // A draft on disk is replaced only after the user confirmed: the page asks via `pendingReplace`.
    const saved = await latestDraft().catch(() => null);
    if (saved && hasWork(saved, await getPhotos(saved.id).catch(() => []))) {
      pendingReplace.value = pending;
      await loadResumable();
      return;
    }
    await startFiles(pending);
    return;
  }
  await loadResumable();
}

/** Files that arrived while an unfinished draft exists: the page asks before replacing it. */
export const pendingReplace = signal<File[] | null>(null);

function hasWork(d: DraftMeta, ps: readonly PhotoMeta[]): boolean {
  const live = ps.filter((p) => !isUploaded(p));
  if (d.phase === "uploading" && live.some((p) => p.upload.state === "queued" || p.upload.state === "failed")) return true;
  return classifyMetas(live).some((c) => c.status === "no-location" || (d.phase !== "done" && c.status === "ready"));
}

async function loadResumable(): Promise<void> {
  try {
    const d = await latestDraft();
    if (!d) { resumable.value = null; return; }
    const ps = await getPhotos(d.id);
    if (!hasWork(d, ps)) {
      await deleteDraft(d.id);
      resumable.value = null;
      bulkReminder.value = { unplaced: 0, unfinished: null };
      return;
    }
    resumable.value = { draft: d, photos: ps };
    bulkReminder.value = summarizeDraft(d.phase, ps, d.sendNo);
  } catch {
    resumable.value = null;
  }
}

/** "Seguir": load the draft found on disk and pick up where it stopped. */
export async function continueDraft(): Promise<void> {
  const found = resumable.value;
  if (!found) return;
  resumable.value = null;
  draft.value = found.draft;
  photos.value = found.photos;
  clearThumbs();
  const blobs = await getThumbs(found.draft.id).catch(() => new Map<string, Blob>());
  const urls = new Map<string, string>();
  for (const [id, blob] of blobs) urls.set(id, URL.createObjectURL(blob));
  thumbUrls.value = urls;
  readProgress.value = { done: found.photos.length, total: found.draft.total };
  if (!found.draft.existsChecked) await checkExisting();
  if (found.draft.phase === "uploading") {
    setPhase("uploading");
    void runUpload();
  } else {
    reviewFilter.value = found.draft.phase === "done" ? "noloc" : "all";
    setPhase("review");
  }
  void resolveNames();
}

/** Back to the first screen for another batch (an unfinished draft is kept until the next files replace it). */
export function resetToChoose(): void {
  clearThumbs();
  draft.value = null;
  photos.value = [];
  phase.value = "choose";
  reviewFilter.value = "all";
  void loadResumable();
}

// ── review actions ────────────────────────────────────────────────────────

export function setDefaults(patch: Partial<BulkDefaults>): void {
  const d = draft.value;
  if (!d) return;
  touchDraft({ defaults: { ...d.defaults, ...patch } });
}

export function placePhoto(id: string, placed: PlacedLocation): void {
  patchPhoto(id, (p) => ({ ...p, placed, omitted: false }));
  void resolveNames();
}

export const omitPhoto = (id: string): void => patchPhoto(id, (p) => ({ ...p, omitted: true }));
export const restorePhoto = (id: string): void => patchPhoto(id, (p) => ({ ...p, omitted: false }));

export function omitAllWithoutLocation(): void {
  const ids = new Set(rows.value.filter((r) => r.status === "no-location").map((r) => r.photo.id));
  patchPhotos(ids, (p) => ({ ...p, omitted: true }));
}

export function setOverride(id: string, override: PhotoOverride): void {
  patchPhoto(id, (p) => ({ ...p, override }));
}

/** "Juntar": keep `keepId`, omit the other photos of the group. */
export function mergeGroup(group: SameGroup, keepId: string): void {
  patchPhotos(new Set(group.ids.filter((id) => id !== keepId)), (p) => ({ ...p, omitted: true }));
}

export function dismissGroup(group: SameGroup): void {
  if (!draft.value) return;
  touchDraft({ dismissedSame: [...draft.value.dismissedSame, group.key] });
}

/** Look up place names for the located photos, one at a time (see `places.ts` for the budget). */
let resolving = false;
export async function resolveNames(): Promise<void> {
  if (resolving) return;
  resolving = true;
  try {
    const tried = new Set<string>();
    for (;;) {
      if (phase.value !== "review" && phase.value !== "uploading") return;
      const next = readyRows.value.map((r) => effectiveCoords(r.photo)).find((c) => c.lat !== null && c.lng !== null && !tried.has(geocodeKey(c.lat, c.lng)) && !placeNames.value.has(geocodeKey(c.lat, c.lng)));
      if (!next || next.lat === null || next.lng === null) return;
      const key = geocodeKey(next.lat, next.lng);
      tried.add(key);
      const name = cachedName(next.lat, next.lng) ?? (await reverseName(next.lat, next.lng));
      if (name) placeNames.value = new Map(placeNames.value).set(key, name);
    }
  } finally {
    resolving = false;
  }
}

// ── send ──────────────────────────────────────────────────────────────────

class BatchError extends Error {
  constructor(public code: string) { super(code); }
}

let batchPromise: Promise<ServerBatch> | null = null;
const TOKEN_MARGIN_MS = 5 * 60_000;

/** The batch of this send; makes one (Turnstile + `POST /api/batches`) when there is none, it expired, or `failedToken` was refused. */
async function ensureBatch(failedToken?: string): Promise<ServerBatch> {
  const current = draft.value?.server;
  if (current && current.batchToken !== failedToken && current.tokenExpiresAt - Date.now() > TOKEN_MARGIN_MS) return current;
  batchPromise ??= (async () => {
    try {
      const sitekey = config.value?.turnstile_sitekey;
      const token = sitekey ? await getTurnstileToken(sitekey) : null;
      const reporter = draft.value?.defaults.soy.trim() || null;
      const res = await api.createBatch({ reporter, turnstile_token: token });
      editGrants.save(`batch:${res.batchId}`, res.editToken);
      const server: ServerBatch = { batchId: res.batchId, batchToken: res.batchToken, tokenExpiresAt: Date.now() + 2 * 3_600_000, editToken: res.editToken };
      touchDraft({ server });
      return server;
    } catch (e) {
      if (e instanceof ApiError) throw new BatchError(e.status === 429 ? "rate_limited" : e.status === 403 ? "turnstile" : e.offline ? "offline" : "error");
      throw new BatchError("turnstile");
    } finally {
      batchPromise = null;
    }
  })();
  return batchPromise;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const extensionOf = (blob: Blob) => (blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "img");

function setBusy(id: string, pct: number | null): void {
  const next = new Map(busy.value);
  if (pct === null) next.delete(id);
  else next.set(id, pct);
  busy.value = next;
}

function markUpload(id: string, upload: Omit<PhotoMeta["upload"], "send">): void {
  patchPhoto(id, (p) => ({ ...p, upload: { send: p.upload.send, ...upload } }));
}

async function uploadPhoto(p: PhotoMeta): Promise<void> {
  const d = draft.value;
  if (!d) return;
  const [blobs, thumb] = await Promise.all([getBlobs(d.id, p.id), getThumb(d.id, p.id)]);
  const meta = buildSpotMeta(p, d.defaults, allowsText);
  if (!blobs.display || !thumb || !meta) {
    markUpload(p.id, { state: "failed", error: "missing" });
    return;
  }
  let attempt = 0;
  let sentToken: string | undefined;
  let renewed = false;
  for (;;) {
    const server = await ensureBatch(sentToken);
    sentToken = server.batchToken;
    const form = new FormData();
    form.set("meta", JSON.stringify(meta));
    form.set("display", blobs.display, `display.${extensionOf(blobs.display)}`);
    form.set("thumb", thumb, `thumb.${extensionOf(thumb)}`);
    if (d.defaults.originals && blobs.original) form.set("original", blobs.original, p.name || "original");
    setBusy(p.id, 0);
    try {
      const res = await api.createSpot(form, { batchToken: server.batchToken, onProgress: (f) => setBusy(p.id, Math.round(f * 100)) });
      markUpload(p.id, { state: "done", spotId: res.id });
      void dropHeavyBlobs(d.id, p.id).catch(() => undefined);
      return;
    } catch (e) {
      const failure = interpretUploadError(e);
      if (failure.kind === "exists") {
        markUpload(p.id, { state: "exists", spotId: failure.id ?? undefined });
        return;
      }
      if (failure.kind === "renew" && !renewed) {
        renewed = true;
        continue;
      }
      if (failure.kind === "retry" && attempt < MAX_RETRIES) {
        attempt++;
        setBusy(p.id, null);
        await sleep(backoffMs(attempt));
        continue;
      }
      markUpload(p.id, { state: "failed", error: failure.kind === "renew" ? "token" : failure.code });
      return;
    } finally {
      setBusy(p.id, null);
    }
  }
}

let wakeLock: WakeLockSentinel | null = null;
const warnBeforeLeaving = (e: BeforeUnloadEvent) => { e.preventDefault(); };

async function holdScreen(): Promise<void> {
  try { wakeLock = (await navigator.wakeLock?.request("screen")) ?? null; } catch { wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && uploadRunning.value) void holdScreen();
});

/** Send the queued and failed photos, 3 at a time. Idempotent: running it twice does nothing the second time. */
export async function runUpload(): Promise<void> {
  if (uploadRunning.value || !draft.value) return;
  uploadRunning.value = true;
  addEventListener("beforeunload", warnBeforeLeaving);
  void holdScreen();
  try {
    // "Reintentar fallidas": failed photos go back in the queue.
    patchPhotos(new Set(photos.value.filter((p) => p.upload.state === "failed").map((p) => p.id)), (p) => ({ ...p, upload: { state: "queued", send: p.upload.send } }));
    const queue = photos.value.filter((p) => p.upload.state === "queued").sort(byTaken);
    let next = 0;
    let batchFailure: string | null = null;
    const worker = async () => {
      while (batchFailure === null) {
        const p = queue[next++];
        if (!p) return;
        try {
          await uploadPhoto(p);
        } catch (e) {
          batchFailure = e instanceof BatchError ? e.code : "error";
          markUpload(p.id, { state: "failed", error: batchFailure });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, queue.length) }, worker));
    if (batchFailure !== null) {
      const code = batchFailure;
      patchPhotos(new Set(photos.value.filter((p) => p.upload.state === "queued").map((p) => p.id)), (p) => ({ ...p, upload: { state: "failed", error: code, send: p.upload.send } }));
    }
  } finally {
    uploadRunning.value = false;
    removeEventListener("beforeunload", warnBeforeLeaving);
    void wakeLock?.release().catch(() => undefined);
    wakeLock = null;
  }
  await finishIfComplete();
}

async function finishIfComplete(): Promise<void> {
  const d = draft.value;
  if (!d || photos.value.some((p) => p.upload.state === "queued" || p.upload.state === "failed")) {
    updateReminder();
    return;
  }
  const server = d.server;
  if (server) {
    const earlier = d.lastSend?.batchId === server.batchId ? d.lastSend.count : 0;
    touchDraft({ lastSend: { batchId: server.batchId, count: earlier + uploadStats.value.created } });
  }
  setPhase("done");
}

/** Mandale Mecha: queue every ready photo and start sending. */
export async function submit(): Promise<void> {
  const d = draft.value;
  if (!d || problem.value !== null || phase.value !== "review") return;
  const ids = new Set(readyRows.value.map((r) => r.photo.id));
  if (!d.existsChecked) await checkExisting();
  const send = d.sendNo + 1;
  touchDraft({ sendNo: send });
  patchPhotos(ids, (p) => ({ ...p, upload: { state: "queued", send } }));
  storage.set("lastTypes", d.defaults.types);
  if (d.defaults.soy.trim()) lastPerson.set(d.defaults.soy);
  const names = new Set<string>();
  for (const p of photos.value) if (ids.has(p.id)) for (const n of (p.override.placer ?? d.defaults.placer).placers) names.add(n);
  if (names.size > 0) rememberPlacers([...names]);
  setPhase("uploading");
  void runUpload();
}

/** "Ubicarlas ahora": back to the review with the photos that are still without a location. */
export function reviewLeftovers(): void {
  reviewFilter.value = "noloc";
  setPhase("review");
  void resolveNames();
}

/** The batch edit grant of the last send (valid 24 h), for "Podés editar por…" and "Borrar este lote". */
export function lastBatchGrant(): { batchId: string; token: string; remainingMs: number } | null {
  const send = draft.value?.lastSend;
  if (!send) return null;
  const grant = editGrants.get(`batch:${send.batchId}`);
  return grant ? { batchId: send.batchId, token: grant.token, remainingMs: editGrants.remainingMs(`batch:${send.batchId}`) } : null;
}

/** "Borrar este lote": soft-deletes every spot of the batch. Resolves true when it worked. */
export async function deleteLastBatch(): Promise<boolean> {
  const grant = lastBatchGrant();
  if (!grant) return false;
  try {
    await api.deleteBatch(grant.batchId, grant.token);
  } catch {
    return false;
  }
  const leftovers = photos.value.filter((p) => !isUploaded(p) && p.upload.state === "idle");
  if (summarizeDraft("review", photos.value).unplaced > 0 || leftovers.some((p) => !p.error)) {
    touchDraft({ lastSend: null });
    reviewFilter.value = "noloc";
    setPhase("review");
  } else {
    await discardDraft();
  }
  return true;
}
