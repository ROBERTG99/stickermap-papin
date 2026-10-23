/**
 * GeoPackage export built in the browser with sql.js (BUILD.md §7.4, §13). One feature table, `spots`, with
 * GeoPackage 1.3 system tables, EPSG:4326 points (GP header + WKB) and one boolean column per sticker type, so the file
 * opens in QGIS the same way the ArcGIS one did. `buildGeoPackage` is pure (give it an initialised sql.js);
 * `exportGeoPackage` loads the wasm lazily with Vite and returns the file.
 */
import type { SqlJsStatic, SqlValue } from "sql.js";
import type { AdminSpot, AdminType } from "./api";

export const GPKG_APPLICATION_ID = 0x47504b47; // "GPKG"
export const GPKG_USER_VERSION = 10300; // 1.3.0
export const SRS_ID = 4326;
export const TABLE = "spots";

/** Only what the layer needs, so tests and callers do not have to fake a whole AdminSpot. */
export type GpkgSpot = Pick<
  AdminSpot,
  "id" | "lat" | "lng" | "types" | "placers" | "reporter" | "place_name" | "country_code" | "taken_at" | "created_at" | "status" | "note" | "photo"
>;
export type GpkgType = Pick<AdminType, "slug">;

const WGS84 =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]';

const FIXED_COLUMNS = ["fid", "geom", "id", "types", "placers", "reporter", "place_name", "country_code", "taken_at", "created_at", "status", "note", "photo_url"];

/** GeoPackage point: 8-byte header (magic "GP", version 0, flags, srs_id) followed by a little-endian WKB point. */
export function pointBlob(lng: number, lat: number, srsId = SRS_ID): Uint8Array {
  const buf = new ArrayBuffer(8 + 21);
  const v = new DataView(buf);
  v.setUint8(0, 0x47); // G
  v.setUint8(1, 0x50); // P
  v.setUint8(2, 0); // version 1 (stored as 0)
  v.setUint8(3, 0b00000001); // standard binary, no envelope, not empty, little endian
  v.setInt32(4, srsId, true);
  v.setUint8(8, 1); // WKB byte order: little endian
  v.setUint32(9, 1, true); // wkbPoint
  v.setFloat64(13, lng, true);
  v.setFloat64(21, lat, true);
  return new Uint8Array(buf);
}

/** Column name for a type slug: letters, digits and underscores; never clashing with the fixed columns. */
export function typeColumn(slug: string, taken: ReadonlySet<string>): string {
  const base = slug.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "tipo";
  let name = base;
  for (let n = 2; taken.has(name) || FIXED_COLUMNS.includes(name); n++) name = `${base}_${n === 2 ? "tipo" : n}`;
  return name;
}

/** The public photo URL for the admin-only one (`/api/admin/img/display/x.webp` -> `<origin>/img/display/x.webp`). */
export function publicPhotoUrl(photo: string | null, origin: string): string | null {
  if (!photo) return null;
  return `${origin}${photo.replace(/^\/api\/admin\/img\//, "/img/")}`;
}

const q = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

export interface GeoPackageOptions {
  /** Prefix for `photo_url` (default: none, so the URL stays relative when no origin is known). */
  origin?: string;
  /** `last_change` and the layer description timestamp (default: now). */
  now?: Date;
}

/** Build the .gpkg bytes for these spots. Type columns follow the order of `types`. */
export function buildGeoPackage(SQL: SqlJsStatic, spots: readonly GpkgSpot[], types: readonly GpkgType[], opts: GeoPackageOptions = {}): Uint8Array {
  const db = new SQL.Database();
  try {
    const taken = new Set<string>();
    const columns = types.map((t) => {
      const name = typeColumn(t.slug, taken);
      taken.add(name);
      return { slug: t.slug, name };
    });

    db.run(`PRAGMA application_id = ${GPKG_APPLICATION_ID}`);
    db.run(`PRAGMA user_version = ${GPKG_USER_VERSION}`);
    db.run(`CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT)`);
    db.run(`CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '',
      last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER,
      CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id))`);
    db.run(`CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL,
      z TINYINT NOT NULL, m TINYINT NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT uk_gc_table_name UNIQUE (table_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents (table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id))`);

    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, ?)", ["Undefined Cartesian SRS", -1, "NONE", -1, "undefined", "undefined Cartesian coordinate reference system"]);
    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, ?)", ["Undefined Geographic SRS", 0, "NONE", 0, "undefined", "undefined geographic coordinate reference system"]);
    db.run("INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, ?)", ["WGS 84 geodetic", SRS_ID, "EPSG", SRS_ID, WGS84, "longitude/latitude coordinates in decimal degrees on the WGS 84 spheroid"]);

    const typeDefs = columns.map((c) => `${q(c.name)} BOOLEAN`).join(", ");
    db.run(`CREATE TABLE ${TABLE} (
      fid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, geom POINT, id TEXT, types TEXT${typeDefs ? `, ${typeDefs}` : ""},
      placers TEXT, reporter TEXT, place_name TEXT, country_code TEXT, taken_at TEXT, created_at DATETIME, status TEXT, note TEXT, photo_url TEXT)`);

    const names = ["geom", "id", "types", ...columns.map((c) => c.name), "placers", "reporter", "place_name", "country_code", "taken_at", "created_at", "status", "note", "photo_url"];
    const insert = db.prepare(`INSERT INTO ${TABLE} (${names.map(q).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    db.run("BEGIN");
    for (const s of spots) {
      minX = Math.min(minX, s.lng);
      maxX = Math.max(maxX, s.lng);
      minY = Math.min(minY, s.lat);
      maxY = Math.max(maxY, s.lat);
      const has = new Set(s.types);
      const row: SqlValue[] = [
        pointBlob(s.lng, s.lat),
        s.id,
        s.types.join(";"),
        ...columns.map((c) => (has.has(c.slug) ? 1 : 0)),
        s.placers.join(";"),
        s.reporter,
        s.place_name,
        s.country_code,
        s.taken_at,
        s.created_at,
        s.status,
        s.note,
        publicPhotoUrl(s.photo, opts.origin ?? ""),
      ];
      insert.run(row);
    }
    db.run("COMMIT");
    insert.free();

    const empty = spots.length === 0;
    db.run("INSERT INTO gpkg_contents (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      TABLE,
      "features",
      TABLE,
      "Mapa Papin: stickers",
      (opts.now ?? new Date()).toISOString(),
      empty ? null : minX,
      empty ? null : minY,
      empty ? null : maxX,
      empty ? null : maxY,
      SRS_ID,
    ]);
    db.run("INSERT INTO gpkg_geometry_columns VALUES (?, ?, ?, ?, ?, ?)", [TABLE, "geom", "POINT", SRS_ID, 0, 0]);
    return db.export();
  } finally {
    db.close();
  }
}

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** sql.js with its wasm served by Vite (loaded on first export only). */
export function loadSqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= (async () => {
    const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import("sql.js"), import("sql.js/dist/sql-wasm.wasm?url")]);
    return initSqlJs({ locateFile: () => wasmUrl });
  })().catch((e: unknown) => {
    sqlPromise = null;
    throw e;
  });
  return sqlPromise;
}

export async function exportGeoPackage(spots: readonly GpkgSpot[], types: readonly GpkgType[]): Promise<Blob> {
  const SQL = await loadSqlJs();
  const bytes = buildGeoPackage(SQL, spots, types, { origin: location.origin });
  return new Blob([bytes as BlobPart], { type: "application/geopackage+sqlite3" });
}
