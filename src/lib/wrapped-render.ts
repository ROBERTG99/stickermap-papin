import { CARD_COLORS, STORY_H, STORY_W, canvasToBlob, drawFitted, drawStickerCircle, ensureFonts, fitLine, fonts, loadImage, newCanvas, wrapText } from "./canvas-card";
import { t } from "./i18n";
import type { WrappedCard, WrappedTheme } from "./wrapped-cards";

/** Grounds of the cards (design tokens, light theme): every pair keeps 4.5:1 contrast. */
const GROUND: Record<WrappedTheme, { bg: string; fg: string }> = {
  brand: { bg: "#31872E", fg: "#FFFFFF" },
  mint: { bg: CARD_COLORS.mint.bg, fg: CARD_COLORS.mint.fg },
  butter: { bg: "#F3DC8C", fg: "#1E1E1A" },
  ink: { bg: CARD_COLORS.ink.bg, fg: CARD_COLORS.ink.fg },
  die: { bg: "#FFFFFF", fg: "#1E1E1A" },
};

/** One Wrapped card as a 1080×1920 PNG (the same pipeline as the story image). `index` of `total` fills the progress bars. */
export async function renderWrappedCard(card: WrappedCard, opts: { year: number; index: number; total: number }): Promise<Blob> {
  await ensureFonts();
  const { bg, fg } = GROUND[card.theme];
  const [logo, icon, ...flags] = await Promise.all([
    loadImage("/img/icons/papa.png"),
    loadImage(card.icon?.url ?? null),
    ...(card.flags ?? []).map((c) => loadImage(`/flags/${c.toLowerCase()}.svg`)),
  ]);
  const { canvas, ctx } = newCanvas();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  const padX = 84;
  const maxW = STORY_W - padX * 2;

  // progress segments
  const gap = 12;
  const segW = (maxW - gap * (opts.total - 1)) / opts.total;
  for (let i = 0; i < opts.total; i++) {
    ctx.globalAlpha = i <= opts.index ? 1 : 0.35;
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.roundRect(padX + i * (segW + gap), 96, segW, 10, 5);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // kicker
  ctx.fillStyle = fg;
  ctx.font = fonts.sans(700, 46);
  ctx.letterSpacing = "2px";
  ctx.fillText(fitLine(ctx, card.kicker.toUpperCase(), maxW), padX, 200);
  ctx.letterSpacing = "0px";

  // body: icon, big number, title, text, flags, centred as one block
  const blocks: { h: number; draw: (y: number) => void }[] = [];
  if (icon && card.icon) {
    const size = 520;
    blocks.push({ h: size + 40, draw: (y) => drawStickerCircle(ctx, icon, STORY_W / 2, y + size / 2, size, card.icon!.fit, -3) });
  }
  let bigPx = 440;
  ctx.font = fonts.display(800, bigPx);
  while (ctx.measureText(card.big).width > maxW && bigPx > 120) {
    bigPx -= 20;
    ctx.font = fonts.display(800, bigPx);
  }
  const bigH = Math.round(bigPx * 0.92);
  blocks.push({ h: bigH + 30, draw: (y) => { ctx.fillStyle = fg; ctx.font = fonts.display(800, bigPx); ctx.fillText(card.big, padX - 6, y + bigH - 8); } });
  ctx.font = fonts.display(800, 96);
  const titleLines = wrapText(ctx, card.title, maxW, 3);
  blocks.push({ h: titleLines.length * 104 + 24, draw: (y) => { ctx.fillStyle = fg; ctx.font = fonts.display(800, 96); titleLines.forEach((l, i) => ctx.fillText(l, padX, y + 84 + i * 104)); } });
  if (card.text) {
    ctx.font = fonts.sans(500, 56);
    const lines = wrapText(ctx, card.text, maxW, 4);
    blocks.push({ h: lines.length * 70 + 20, draw: (y) => { ctx.fillStyle = fg; ctx.font = fonts.sans(500, 56); lines.forEach((l, i) => ctx.fillText(l, padX, y + 52 + i * 70)); } });
  }
  const shown = flags.filter((f): f is HTMLImageElement => f !== null);
  if (shown.length) {
    blocks.push({
      h: 150,
      draw: (y) => shown.forEach((f, i) => {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(padX + i * 170, y + 20, 150, 112, 14);
        ctx.clip();
        drawFitted(ctx, f, padX + i * 170, y + 20, 150, 112, "cover");
        ctx.restore();
      }),
    });
  }
  const total = blocks.reduce((s, b) => s + b.h, 0);
  const top = 260;
  const bottom = STORY_H - 300;
  let y = top + Math.max(0, (bottom - top - total) / 2);
  for (const b of blocks) {
    b.draw(y);
    y += b.h;
  }

  // footer
  drawStickerCircle(ctx, logo, padX + 54, STORY_H - 150, 108, "contain", -3);
  ctx.fillStyle = fg;
  ctx.font = fonts.display(800, 56);
  ctx.fillText(fitLine(ctx, t("wrapped.footer", { year: opts.year }), maxW - 140), padX + 130, STORY_H - 130);
  return canvasToBlob(canvas);
}
