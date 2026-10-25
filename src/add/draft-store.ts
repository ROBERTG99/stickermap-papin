/**
 * The unsent sticker lives in IndexedDB so a failed upload on a bad connection can be retried without picking the photo
 * again (BUILD.md §7.3, "Failure handling"). Every call swallows errors: private windows and blocked storage just mean
 * the draft only survives in memory. There is no background queue; the draft waits for "Reintentar".
 */
import { openDB, type DBSchema } from "idb";
import type { Derivative, PhotoExif } from "../lib/photo";
import type { Candidate } from "./state";
import type { LocationChoice } from "./logic";

export interface AddDraft {
  v: 1;
  savedAt: number;
  photo: {
    /** The original file as picked (uploaded as `original` when it is a JPEG/PNG/WebP/HEIC up to 25 MB). */
    file: File;
    viaCamera: boolean;
    keepAnyway: boolean;
    sha256: string;
    exif: PhotoExif;
    display: Derivative | null;
    thumb: Derivative | null;
    decoded: boolean;
  } | null;
  choice: LocationChoice | null;
  exif: Candidate | null;
  approximate: boolean;
  types: string[];
  otherText: string;
  soy: string;
  instagram?: string;
  postUrl?: string;
  note: string;
}

interface Schema extends DBSchema {
  drafts: { key: string; value: AddDraft };
}

const KEY = "add";
const db = () => openDB<Schema>("mapa-papin-add", 1, { upgrade: (d) => { d.createObjectStore("drafts"); } });

export async function saveDraft(draft: AddDraft): Promise<boolean> {
  try {
    await (await db()).put("drafts", draft, KEY);
    return true;
  } catch {
    return false;
  }
}

export async function loadDraft(): Promise<AddDraft | null> {
  try {
    const draft = await (await db()).get("drafts", KEY);
    return draft?.v === 1 ? draft : null;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await (await db()).delete("drafts", KEY);
  } catch {
    /* nothing stored */
  }
}
