import type { SpotDetail, StickerType } from "../shared/types";
import { CARD_COLORS, STORY_H, STORY_W, canvasToBlob, drawFitted, drawPolaroid, drawStickerCircle, ensureFonts, fitLine, fonts, loadImage, newCanvas, polaroidCorner, wrapText, type CardTheme } from "./canvas-card";

export interface StoryInput {
  /** `/img/display/<id>.webp` (or the poster), null for a spot without a photo. */
  photo: string | null;
  types: { icon: string; fit: "cover" | "contain" }[];
  /** "@handle", or the person's name; null for an anonymous spot. */
  by: string | null;
  place: string;
  countryCode: string | null;
  /** Printed at the bottom, without the protocol. */
  url: string;
  logoIcon?: string;
}

/** The 1080×1920 "Pegado por" story (design: ShareCard). Same layout as `.mp-story` scaled ×4. */
export async function renderStory(input: StoryInput, theme: CardTheme): Promise<Blob> {
  await ensureFonts();
  const colors = CARD_COLORS[theme];
  const [photo, logo, flag, ...icons] = await Promise.all([
    loadImage(input.photo),
    loadImage(input.logoIcon ?? "/img/icons/papa.png"),
    loadImage(input.countryCode ? `/flags/${input.countryCode.toLowerCase()}.svg` : null),
    ...input.types.slice(0, 4).map((t) => loadImage(t.icon)),
  ]);
  const { canvas, ctx } = newCanvas();
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  const padX = 76;
  const maxW = STORY_W - padX * 2;

  // logo row
  const logoSize = 108;
  drawStickerCircle(ctx, logo, padX + logoSize / 2, 76 + logoSize / 2, logoSize, "contain", -3);
  ctx.fillStyle = colors.fg;
  ctx.font = fonts.display(800, 65);
  ctx.fillText("Mapa Papin", padX + logoSize + 22, 76 + logoSize / 2 + 22);

  // bottom stack, laid out from the bottom up
  const bottom = STORY_H - 65;
  ctx.font = fonts.mono(600, 45);
  const url = fitLine(ctx, input.url, maxW);
  const urlY = bottom - 8;
  ctx.fillStyle = colors.sub;
  ctx.fillText(url, padX, urlY);

  const placeY = urlY - 56 - 43;
  ctx.font = fonts.sans(600, 54);
  ctx.fillStyle = colors.fg;
  const flagW = 72;
  const flagH = 54;
  const textX = padX + (flag ? flagW + 18 : 0);
  if (flag) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(padX, placeY - flagH + 10, flagW, flagH, 8);
    ctx.clip();
    ctx.drawImage(flag, padX, placeY - flagH + 10, flagW, flagH);
    ctx.restore();
  }
  ctx.fillText(fitLine(ctx, input.place, maxW - (textX - padX)), textX, placeY);

  const nameLines = input.by ? wrapText(ctxWith(ctx, fonts.display(800, 81)), input.by, maxW, 2) : [];
  let stackTop = placeY - 54 - 20;
  if (nameLines.length) {
    let y = placeY - 54 - 43;
    ctx.font = fonts.display(800, 81);
    ctx.fillStyle = colors.fg;
    for (let i = nameLines.length - 1; i >= 0; i--) {
      ctx.fillText(nameLines[i]!, padX, y);
      y -= 88;
    }
    ctx.font = fonts.sans(600, 50);
    ctx.fillStyle = colors.sub;
    ctx.fillText("Pegado por", padX, y + 20);
    stackTop = y + 20 - 50;
  }

  // polaroid centred in what is left
  const areaTop = 76 + logoSize + 43;
  const areaBottom = stackTop - 30;
  const polW = Math.min(780, Math.round(maxW * 0.84));
  const ratio = 5 / 4;
  const cx = STORY_W / 2;
  const cy = areaTop + (areaBottom - areaTop) / 2;
  const tilt = -2;
  const lead = input.types[0];
  const { h } = drawPolaroid(ctx, photo, cx, cy, polW, ratio, tilt, () => {
    if (icons[0] && lead) drawFitted(ctx, icons[0], -polW * 0.3, -polW * 0.3, polW * 0.6, polW * 0.6, lead.fit);
  });

  // type stickers hang off the top-right corner
  const corner = polaroidCorner(cx, cy, polW, h, tilt);
  const stSize = 162;
  icons.forEach((icon, i) => {
    const t = input.types[i]!;
    drawStickerCircle(ctx, icon, corner.x - 20 - i * (stSize - 40), corner.y + 10, stSize, t.fit, -4 + i * 5);
  });

  return canvasToBlob(canvas);
}

function ctxWith(ctx: CanvasRenderingContext2D, font: string): CanvasRenderingContext2D {
  ctx.font = font;
  return ctx;
}

/** What the story needs from a spot: "@handle" when the person has one, else their name. */
export function storyInputFor(spot: SpotDetail, allTypes: readonly StickerType[], origin = location.host): StoryInput {
  const person = spot.placers[0] ?? spot.reporter;
  const handle = person ? spot.ig?.[person] : undefined;
  return {
    photo: spot.photo,
    types: spot.types.map((slug) => allTypes.find((x) => x.slug === slug)).filter((x): x is StickerType => x !== undefined).map((x) => ({ icon: x.icon, fit: x.fit })),
    by: handle ? `@${handle}` : person,
    place: spot.place_name ?? spot.city ?? spot.country ?? "",
    countryCode: spot.country_code,
    url: `${origin}/s/${spot.id}`,
  };
}
