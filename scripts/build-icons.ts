/**
 * PWA / app icons (design system, Page13System 10e): brand-green tile, the Papa sticker with its white die edge and tilt-1.
 *   npx tsx scripts/build-icons.ts   -> src/public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png and favicon.svg tweaks
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const BRAND = "#31872E";
const SRC = "investigation/icons/papa.png";

async function tile(size: number, opts: { radius: number; sticker: number; maskable?: boolean }): Promise<Buffer> {
  const r = Math.round(size * opts.radius);
  const stickerPx = Math.round(size * opts.sticker);
  const ring = Math.max(2, Math.round(size * 0.022)); // die edge
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${BRAND}"/>` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${stickerPx / 2 + ring}" fill="#FFFFFF" transform="rotate(-3 ${size / 2} ${size / 2})"/></svg>`,
  );
  const inner = Math.round(stickerPx * 0.84); // 8% margin: the potato "contains" inside its die-cut circle
  const potato = await sharp(SRC).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .rotate(-3, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp(bg).composite([{ input: potato, gravity: "centre" }]).png({ compressionLevel: 9 }).toBuffer();
}

await mkdir("src/public/icons", { recursive: true });
const jobs: [string, number, { radius: number; sticker: number }][] = [
  ["icon-192.png", 192, { radius: 0.22, sticker: 0.62 }],
  ["icon-512.png", 512, { radius: 0.22, sticker: 0.62 }],
  // maskable: full-bleed, sticker inside the 80% circular safe zone
  ["maskable-512.png", 512, { radius: 0, sticker: 0.5 }],
  ["apple-touch-icon.png", 180, { radius: 0, sticker: 0.62 }],
  ["favicon-32.png", 32, { radius: 0.22, sticker: 0.66 }],
];
for (const [name, size, o] of jobs) {
  await sharp(await tile(size, o)).toFile(`src/public/icons/${name}`);
  console.log(`wrote src/public/icons/${name}`);
}
