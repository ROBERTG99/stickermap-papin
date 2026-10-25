export type ImageKind = "jpeg" | "png" | "webp" | "heic";

/** Sniff the real format from magic bytes (the client-sent MIME type is never trusted). SVG is rejected. */
export function sniffImage(head: Uint8Array): ImageKind | null {
  const at = (i: number) => head[i] ?? 0;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "png";
  const tag = (from: number, len: number) => String.fromCharCode(...head.slice(from, from + len));
  if (tag(0, 4) === "RIFF" && tag(8, 4) === "WEBP") return "webp";
  if (tag(4, 4) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(tag(8, 4))) return "heic";
  return null;
}

export const CONTENT_TYPE: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};
export const EXTENSION: Record<ImageKind, string> = { jpeg: "jpg", png: "png", webp: "webp", heic: "heic" };

export type VideoKind = "mp4" | "mov";

/** MP4 / QuickTime by the `ftyp` box (the client-sent MIME type is never trusted). HEIC images share the box, so they are excluded. */
export function sniffVideo(head: Uint8Array): VideoKind | null {
  const tag = (from: number, len: number) => String.fromCharCode(...head.slice(from, from + len));
  if (tag(4, 4) !== "ftyp") return null;
  const brand = tag(8, 4);
  if (brand === "qt  ") return "mov";
  if (/^(heic|heix|hevc|hevx|mif1|msf1|heim|heis|avif)/.test(brand)) return null;
  return "mp4";
}

export const VIDEO_CONTENT_TYPE: Record<VideoKind, string> = { mp4: "video/mp4", mov: "video/quicktime" };
