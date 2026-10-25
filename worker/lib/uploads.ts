import { MAX } from "../../src/shared/schema";
import { sniffImage, sniffVideo, type ImageKind, type VideoKind } from "./images";

export interface CheckedFile { bytes: ArrayBuffer; kind: ImageKind }

export async function readImage(part: unknown, maxBytes: number, allowHeic: boolean): Promise<CheckedFile | "too_large" | "bad_image" | null> {
  if (part === null || part === undefined || typeof part === "string") return null;
  const file = part as File;
  if (file.size === 0) return null;
  if (file.size > maxBytes) return "too_large";
  const bytes = await file.arrayBuffer();
  const kind = sniffImage(new Uint8Array(bytes, 0, Math.min(32, bytes.byteLength)));
  if (!kind || (!allowHeic && kind === "heic")) return "bad_image";
  return { bytes, kind };
}

export interface CheckedVideo { bytes: ArrayBuffer; kind: VideoKind }

/** `video/mp4` by magic bytes up to 60 MB; QuickTime only as the untranscoded fallback (50 MB). */
export async function readVideo(part: unknown): Promise<CheckedVideo | "too_large" | "bad_video" | null> {
  if (part === null || part === undefined || typeof part === "string") return null;
  const file = part as File;
  if (file.size === 0) return null;
  if (file.size > MAX.videoBytes) return "too_large";
  const bytes = await file.arrayBuffer();
  const kind = sniffVideo(new Uint8Array(bytes, 0, Math.min(32, bytes.byteLength)));
  if (!kind) return "bad_video";
  if (kind === "mov" && bytes.byteLength > MAX.videoFallbackBytes) return "too_large";
  return { bytes, kind };
}
