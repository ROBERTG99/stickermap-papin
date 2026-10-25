/** Canvas helpers for the 1080×1920 share images (F2 stories, F5 Wrapped). Everything is drawn from same-origin assets, so the canvas is never tainted. */

export const STORY_W = 1080;
export const STORY_H = 1920;

export type CardTheme = "mint" | "brand" | "ink";

/** Light-theme values of the design tokens (a share image looks the same whatever theme the viewer uses). */
export const CARD_COLORS: Record<CardTheme, { bg: string; fg: string; sub: string }> = {
  mint: { bg: "#B7DCC7", fg: "#1E1E1A", sub: "#505050" },
  brand: { bg: "#31872E", fg: "#FFFFFF", sub: "#FFFFFF" },
  ink: { bg: "#1E1E1A", fg: "#FAFAF5", sub: "#FAFAF5" },
};

const FONT_DISPLAY = '"Bricolage Grotesque Variable", "Bricolage Grotesque", "Figtree Variable", Figtree, system-ui, sans-serif';
const FONT_SANS = '"Figtree Variable", Figtree, system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const fonts = {
  display: (weight: number, px: number) => `${weight} ${px}px ${FONT_DISPLAY}`,
  sans: (weight: number, px: number) => `${weight} ${px}px ${FONT_SANS}`,
  mono: (weight: number, px: number) => `${weight} ${px}px ${FONT_MONO}`,
};

/** Variable fonts load per unicode range on first use: ask for the weights the cards draw, then wait for the document. */
export async function ensureFonts(): Promise<void> {
  try {
    await Promise.all([fonts.display(800, 80), fonts.sans(600, 50), fonts.sans(800, 50)].map((f) => document.fonts.load(f, "Aa@áéíóúñ¿")));
    await document.fonts.ready;
  } catch {
    /* system fonts are fine */
  }
}

export function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function newCanvas(w = STORY_W, h = STORY_H): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}

export const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("png_failed"))), "image/png"));

/** One line that fits `maxWidth`: the text itself, or cut with an ellipsis. */
export function fitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/** Greedy word wrap into at most `maxLines`; the last line gets the ellipsis when text is left over. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i]!;
    if (lines.length === maxLines - 1) {
      line = words.slice(i).join(" ");
      break;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).map((l, i, all) => (i === all.length - 1 ? fitLine(ctx, l, maxWidth) : l));
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw `img` so it fills the box (cover) or sits inside it (contain). */
export function drawFitted(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, fit: "cover" | "contain" = "cover"): void {
  const k = fit === "cover" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** A die-cut type sticker: white disc with a soft shadow, the icon inside. */
export function drawStickerCircle(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, size: number, fit: "cover" | "contain", tiltDeg = 0): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((tiltDeg * Math.PI) / 180);
  ctx.shadowColor = "rgba(30,30,26,.28)";
  ctx.shadowBlur = size * 0.1;
  ctx.shadowOffsetY = size * 0.04;
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  if (img) {
    const inner = size / 2 - size * 0.045;
    ctx.beginPath();
    ctx.arc(0, 0, inner, 0, Math.PI * 2);
    ctx.clip();
    const box = fit === "contain" ? inner * 1.55 : inner * 2;
    drawFitted(ctx, img, -box / 2, -box / 2, box, box, fit);
  }
  ctx.restore();
}

/** A white-framed photo with the bottom margin of a polaroid, tilted around its centre. */
export function drawPolaroid(ctx: CanvasRenderingContext2D, photo: HTMLImageElement | null, cx: number, cy: number, w: number, photoRatio: number, tiltDeg: number, fallback?: () => void): { h: number } {
  const pad = Math.round(w * 0.03);
  const innerW = w - pad * 2;
  const innerH = Math.round(innerW * photoRatio);
  const h = pad + innerH + pad * 2.2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((tiltDeg * Math.PI) / 180);
  ctx.shadowColor = "rgba(30,30,26,.3)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, -w / 2, -h / 2, w, h, 18);
  ctx.fill();
  ctx.shadowColor = "transparent";
  const px = -w / 2 + pad;
  const py = -h / 2 + pad;
  ctx.save();
  roundRect(ctx, px, py, innerW, innerH, 10);
  ctx.clip();
  if (photo) {
    drawFitted(ctx, photo, px, py, innerW, innerH, "cover");
  } else {
    ctx.fillStyle = "#E4F1E9";
    ctx.fillRect(px, py, innerW, innerH);
    ctx.translate(px + innerW / 2, py + innerH / 2);
    fallback?.();
  }
  ctx.restore();
  ctx.restore();
  return { h };
}

/** Where a polaroid's corner ends up after the tilt (to hang the type stickers on it). */
export const polaroidCorner = (cx: number, cy: number, w: number, h: number, tiltDeg: number): { x: number; y: number } => {
  const a = (tiltDeg * Math.PI) / 180;
  const x = w / 2;
  const y = -h / 2;
  return { x: cx + x * Math.cos(a) - y * Math.sin(a), y: cy + x * Math.sin(a) + y * Math.cos(a) };
};

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Native share sheet with the PNG when the browser can send files; otherwise a download. */
export async function shareImage(blob: Blob, opts: { filename: string; title: string; text: string; url: string }): Promise<ShareOutcome> {
  const file = new File([blob], opts.filename, { type: blob.type || "image/png" });
  try {
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: opts.title, text: opts.text, url: opts.url });
      return "shared";
    }
  } catch (error) {
    if ((error as DOMException).name === "AbortError") return "cancelled";
  }
  downloadBlob(blob, opts.filename);
  return "downloaded";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Instagram cannot pre-fill a link sticker, so the link is copied for the person to paste. */
export async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
