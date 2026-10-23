/**
 * Generate the e2e photo fixtures into tests/e2e/fixtures/generated (git-ignored):
 *  - gps-*.jpg   JPEGs that carry their own GPS EXIF (+ DateTimeOriginal)
 *  - nogps-*.jpg JPEGs without any location
 *  - bulk-50/    the 50-photo set of BUILD.md §14: 44 with GPS, 3 without, 1 already on the map (copy of a legacy photo),
 *                1 repeated inside the batch, 1 unreadable
 *   npx tsx tests/e2e/fixtures/make-fixtures.ts
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUT = "tests/e2e/fixtures/generated";

function dms(value: number): string {
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.round(((abs - d) * 60 - m) * 60 * 1000);
  return `${d}/1 ${m}/1 ${s}/1000`;
}

/** A unique, deterministic picture so every file has its own SHA-256. */
async function picture(seed: number, gps?: { lat: number; lng: number; takenAt: string }): Promise<Buffer> {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="hsl(${hue},55%,60%)"/><circle cx="${100 + (seed * 37) % 440}" cy="${90 + (seed * 53) % 300}" r="${40 + (seed % 5) * 12}" fill="hsl(${(hue + 120) % 360},60%,35%)"/><text x="24" y="460" font-size="48" font-family="sans-serif" fill="white">${seed}</text></svg>`;
  let img = sharp(Buffer.from(svg)).jpeg({ quality: 82 });
  if (gps) {
    img = img.withExif({
      IFD0: { Make: "MapaPapinTest", Model: "fixture" },
      IFD2: { DateTimeOriginal: gps.takenAt },
      IFD3: {
        GPSLatitudeRef: gps.lat >= 0 ? "N" : "S", GPSLatitude: dms(gps.lat),
        GPSLongitudeRef: gps.lng >= 0 ? "E" : "W", GPSLongitude: dms(gps.lng),
      },
    });
  }
  return img.toBuffer();
}

await mkdir(join(OUT, "bulk-50"), { recursive: true });

// single-flow fixtures
await writeFile(join(OUT, "gps-montevideo.jpg"), await picture(1, { lat: -34.9061, lng: -56.1993, takenAt: "2025:04:15 10:42:00" }));
await writeFile(join(OUT, "nogps-1.jpg"), await picture(2));
await writeFile(join(OUT, "nogps-2.jpg"), await picture(3));
// more distinct no-GPS photos: a photo already on the map is a duplicate, so every spec that adds one needs its own
for (let i = 3; i <= 10; i++) await writeFile(join(OUT, `nogps-${i}.jpg`), await picture(300 + i));

// bulk fixture: 44 GPS around Montevideo/Buenos Aires, 3 without GPS, 1 on the map, 1 repeated, 1 unreadable
const files: string[] = [];
for (let i = 0; i < 44; i++) {
  const name = `gps-${String(i + 1).padStart(2, "0")}.jpg`;
  const lat = -34.9 + (i % 11) * 0.011;
  const lng = i < 22 ? -56.17 + (i % 11) * 0.013 : -58.4 + (i % 11) * 0.013;
  await writeFile(join(OUT, "bulk-50", name), await picture(100 + i, { lat, lng, takenAt: `2025:04:15 10:${String(i).padStart(2, "0")}:00` }));
  files.push(name);
}
for (let i = 0; i < 3; i++) await writeFile(join(OUT, "bulk-50", `nogps-${i + 1}.jpg`), await picture(200 + i));
// "already on the map": byte-identical copy of a legacy photo (objectid 1, which has GPS EXIF)
await copyFile("build/extract/photos/001__IMG_20230802_103101_Original.jpeg", join(OUT, "bulk-50", "already-on-map.jpeg"));
// "repeated inside the batch": same bytes as gps-01
await copyFile(join(OUT, "bulk-50", "gps-01.jpg"), join(OUT, "bulk-50", "repeat-of-gps-01.jpg"));
// "unreadable"
await writeFile(join(OUT, "bulk-50", "broken.jpg"), Buffer.from("this is not an image"));

// photos for the specs that send their own small batches (they must not overlap with the 50-photo set: a sent photo is "already on the map")
await mkdir(join(OUT, "extra"), { recursive: true });
for (let i = 0; i < 20; i++) {
  const name = `extra-${String(i + 1).padStart(2, "0")}.jpg`;
  await writeFile(join(OUT, "extra", name), await picture(500 + i, { lat: 40.4 + i * 0.002, lng: -3.7 + i * 0.002, takenAt: `2025:05:01 09:${String(i).padStart(2, "0")}:00` }));
}

const count = (await readFile(join(OUT, "bulk-50", "gps-01.jpg"))).length;
console.log(`fixtures written to ${OUT} (gps-01.jpg is ${count} bytes); bulk-50 has ${files.length + 3 + 3} files`);
