/**
 * D1 -> GeoJSON + CSV for the anti-lock-in export (BUILD.md §13). The weekly workflow turns the GeoJSON into a GeoPackage
 * with `ogr2ogr -f GPKG stickermap.gpkg stickermap.geojson -nln spots`.
 *
 *   npx tsx scripts/export.ts --target remote|local --out build/export
 *
 * One row per published spot: types as a `;`-joined text plus one 0/1 column per sticker type, placers, reporter, dates,
 * place and photo_url. Exit code is non-zero when the export is empty.
 */
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const target = arg("--target", "remote") === "local" ? "--local" : "--remote";
const out = arg("--out", "build/export");
const origin = arg("--origin", "");

async function query<T>(sql: string): Promise<T[]> {
  const { stdout } = await run("npx", ["wrangler", "d1", "execute", "stickermap", target, "--json", "--command", sql], { maxBuffer: 256 * 1024 * 1024 });
  return (JSON.parse(stdout.slice(stdout.indexOf("["))) as { results: T[] }[])[0]?.results ?? [];
}

interface Row {
  id: string; lat: number; lng: number; place_name: string | null; country_code: string | null; taken_at: string | null; created_at: string;
  reporter: string | null; placer_status: string; note: string | null; photo_key: string | null; location_source: string;
  types: string | null; placers: string | null;
}

const types = await query<{ slug: string }>("SELECT slug FROM sticker_types ORDER BY sort_order, slug");
const rows = await query<Row>(
  `SELECT s.id, s.lat, s.lng, s.place_name, s.country_code, s.taken_at, s.created_at, s.placer_status, s.note, s.photo_key, s.location_source,
          rp.display_name AS reporter,
          (SELECT group_concat(type_slug, ';') FROM (SELECT st.type_slug FROM spot_types st JOIN sticker_types t ON t.slug = st.type_slug WHERE st.spot_id = s.id ORDER BY t.sort_order)) AS types,
          (SELECT group_concat(name, ';') FROM (SELECT p.display_name AS name FROM spot_placers sp JOIN people p ON p.id = sp.person_id WHERE sp.spot_id = s.id ORDER BY p.display_name)) AS placers
     FROM spots s LEFT JOIN people rp ON rp.id = s.reporter_person_id WHERE s.status = 'published' ORDER BY s.created_at, s.id`,
);
if (rows.length === 0) { console.error("export is empty"); process.exit(1); }

const props = (r: Row) => {
  const held = new Set((r.types ?? "").split(";").filter(Boolean));
  return {
    id: r.id, types: r.types ?? "", ...Object.fromEntries(types.map((t) => [`type_${t.slug.replaceAll("-", "_")}`, held.has(t.slug) ? 1 : 0])),
    placer_status: r.placer_status, placers: r.placers ?? "", reporter: r.reporter ?? "", place_name: r.place_name || "", country_code: r.country_code ?? "",
    taken_at: r.taken_at ?? "", created_at: r.created_at, location_source: r.location_source, note: r.note ?? "",
    photo_url: r.photo_key && origin ? `${origin}/img/${r.photo_key}` : "",
  };
};

await mkdir(out, { recursive: true });
await writeFile(join(out, "stickermap.geojson"), JSON.stringify({
  type: "FeatureCollection", name: "spots",
  features: rows.map((r) => ({ type: "Feature", id: r.id, geometry: { type: "Point", coordinates: [r.lng, r.lat] }, properties: props(r) })),
}));

const cols = Object.keys(props(rows[0]!));
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula guard (numbers are left alone)
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const csv = [["lat", "lng", ...cols].join(","), ...rows.map((r) => [r.lat, r.lng, ...Object.values(props(r))].map(cell).join(","))].join("\r\n") + "\r\n";
await writeFile(join(out, "stickermap.csv"), "﻿" + csv);
console.log(`exported ${rows.length} spots to ${out}/stickermap.{geojson,csv}`);
