import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DraftMeta, PhotoMeta } from "./types";

/**
 * IndexedDB draft of a bulk add. Metadata and blobs are separate records so memory stays flat: the list only keeps the small
 * thumbnails; the 1600 px display image and the original are read back one photo at a time when it is that photo's turn.
 * When IndexedDB cannot be opened at all (some private windows) everything lives in memory for this visit.
 */
type PhotoRow = PhotoMeta & { key: string; draftId: string };
interface ThumbRow { key: string; draftId: string; thumb: Blob | null }
interface BlobRow { key: string; draftId: string; display: Blob | null; original: Blob | null }

interface BulkDb extends DBSchema {
  drafts: { key: string; value: DraftMeta };
  photos: { key: string; value: PhotoRow; indexes: { draft: string } };
  thumbs: { key: string; value: ThumbRow; indexes: { draft: string } };
  blobs: { key: string; value: BlobRow; indexes: { draft: string } };
}

let dbPromise: Promise<IDBPDatabase<BulkDb> | null> | null = null;

function db(): Promise<IDBPDatabase<BulkDb> | null> {
  dbPromise ??= openDB<BulkDb>("mapapapin-bulk", 1, {
    upgrade(d) {
      d.createObjectStore("drafts", { keyPath: "id" });
      d.createObjectStore("photos", { keyPath: "key" }).createIndex("draft", "draftId");
      d.createObjectStore("thumbs", { keyPath: "key" }).createIndex("draft", "draftId");
      d.createObjectStore("blobs", { keyPath: "key" }).createIndex("draft", "draftId");
    },
  }).catch(() => null);
  return dbPromise;
}

const memory = {
  drafts: new Map<string, DraftMeta>(),
  photos: new Map<string, PhotoRow>(),
  thumbs: new Map<string, ThumbRow>(),
  blobs: new Map<string, BlobRow>(),
};

const key = (draftId: string, photoId: string) => `${draftId}:${photoId}`;

export async function putDraft(draft: DraftMeta): Promise<void> {
  const d = await db();
  if (d) await d.put("drafts", draft);
  else memory.drafts.set(draft.id, draft);
}

/** The most recently touched draft, or null. */
export async function latestDraft(): Promise<DraftMeta | null> {
  const d = await db();
  const all = d ? await d.getAll("drafts") : [...memory.drafts.values()];
  return all.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

export async function putPhotos(draftId: string, photos: readonly PhotoMeta[]): Promise<void> {
  if (photos.length === 0) return;
  const rows = photos.map((p): PhotoRow => ({ ...p, key: key(draftId, p.id), draftId }));
  const d = await db();
  if (!d) {
    for (const r of rows) memory.photos.set(r.key, r);
    return;
  }
  const tx = d.transaction("photos", "readwrite");
  await Promise.all([...rows.map((r) => tx.store.put(r)), tx.done]);
}

export async function getPhotos(draftId: string): Promise<PhotoMeta[]> {
  const d = await db();
  const rows = d ? await d.getAllFromIndex("photos", "draft", draftId) : [...memory.photos.values()].filter((r) => r.draftId === draftId);
  return rows.map(({ key: _key, draftId: _draftId, ...meta }): PhotoMeta => meta).sort((a, b) => a.seq - b.seq);
}

export async function putBlobs(draftId: string, photoId: string, blobs: { thumb: Blob | null; display: Blob | null; original: Blob | null }): Promise<void> {
  const k = key(draftId, photoId);
  const d = await db();
  if (!d) {
    memory.thumbs.set(k, { key: k, draftId, thumb: blobs.thumb });
    memory.blobs.set(k, { key: k, draftId, display: blobs.display, original: blobs.original });
    return;
  }
  const tx = d.transaction(["thumbs", "blobs"], "readwrite");
  await Promise.all([
    tx.objectStore("thumbs").put({ key: k, draftId, thumb: blobs.thumb }),
    tx.objectStore("blobs").put({ key: k, draftId, display: blobs.display, original: blobs.original }),
    tx.done,
  ]);
}

export async function getThumbs(draftId: string): Promise<Map<string, Blob>> {
  const d = await db();
  const rows = d ? await d.getAllFromIndex("thumbs", "draft", draftId) : [...memory.thumbs.values()].filter((r) => r.draftId === draftId);
  const out = new Map<string, Blob>();
  for (const r of rows) if (r.thumb) out.set(r.key.slice(draftId.length + 1), r.thumb);
  return out;
}

export async function getBlobs(draftId: string, photoId: string): Promise<{ display: Blob | null; original: Blob | null }> {
  const k = key(draftId, photoId);
  const d = await db();
  const row = d ? await d.get("blobs", k) : memory.blobs.get(k);
  return { display: row?.display ?? null, original: row?.original ?? null };
}

/** The thumbnail of one photo (used for the display/thumb pair of an upload). */
export async function getThumb(draftId: string, photoId: string): Promise<Blob | null> {
  const k = key(draftId, photoId);
  const d = await db();
  const row = d ? await d.get("thumbs", k) : memory.thumbs.get(k);
  return row?.thumb ?? null;
}

/** Free the heavy blobs of a photo that is on the server; the thumbnail stays for the screens. */
export async function dropHeavyBlobs(draftId: string, photoId: string): Promise<void> {
  const d = await db();
  if (d) await d.delete("blobs", key(draftId, photoId));
  else memory.blobs.delete(key(draftId, photoId));
}

export async function deleteDraft(draftId: string): Promise<void> {
  const d = await db();
  if (!d) {
    memory.drafts.delete(draftId);
    for (const store of [memory.photos, memory.thumbs, memory.blobs] as Map<string, { draftId: string }>[]) {
      for (const [k, v] of store) if (v.draftId === draftId) store.delete(k);
    }
    return;
  }
  const tx = d.transaction(["drafts", "photos", "thumbs", "blobs"], "readwrite");
  const clear = async (store: "photos" | "thumbs" | "blobs") => {
    const os = tx.objectStore(store);
    for (const k of await os.index("draft").getAllKeys(draftId)) await os.delete(k);
  };
  await Promise.all([tx.objectStore("drafts").delete(draftId), clear("photos"), clear("thumbs"), clear("blobs"), tx.done]);
}
