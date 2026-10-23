import { DISPLAY_EDGE, resizeBitmap, THUMB_EDGE, type Derivative, type ProcessedPhoto } from "../lib/photo";

/** Largest the 1600 px derivative may be (the server refuses display files above 1.5 MB). */
const DISPLAY_MAX_BYTES = 1_450_000;
const THUMB_MAX_BYTES = 190_000;

async function rotateBlob(blob: Blob, edge: number, quality: number, maxBytes: number): Promise<Derivative> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(bitmap, 0, 0);
    const rotated = await createImageBitmap(canvas);
    try {
      return await resizeBitmap(rotated, edge, quality, maxBytes);
    } finally {
      rotated.close();
    }
  } finally {
    bitmap.close();
  }
}

/** Turn the derivatives a quarter turn clockwise ("Rotar"). The original and its hash stay untouched. */
export async function rotatePhoto(processed: ProcessedPhoto): Promise<ProcessedPhoto> {
  if (!processed.display || !processed.thumb) return processed;
  const [display, thumb] = await Promise.all([
    rotateBlob(processed.display.blob, DISPLAY_EDGE, 0.8, DISPLAY_MAX_BYTES),
    rotateBlob(processed.thumb.blob, THUMB_EDGE, 0.7, THUMB_MAX_BYTES),
  ]);
  return { ...processed, display, thumb };
}

/** File name with the right extension for an encoded derivative. */
export const derivativeName = (kind: "display" | "thumb", blob: Blob) => `${kind}.${blob.type === "image/jpeg" ? "jpg" : "webp"}`;
