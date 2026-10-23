import { resolve } from "node:path";
import initSqlJs from "sql.js";
import type { SqlJsStatic, SqlValue } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { GPKG_APPLICATION_ID, GPKG_USER_VERSION, buildGeoPackage, pointBlob, publicPhotoUrl, typeColumn, type GpkgSpot } from "../../src/admin/gpkg";

let SQL: SqlJsStatic;

beforeAll(async () => {
  SQL = await initSqlJs({ locateFile: () => resolve(__dirname, "../../node_modules/sql.js/dist/sql-wasm.wasm") });
});

const spot = (over: Partial<GpkgSpot> & Pick<GpkgSpot, "id" | "lat" | "lng">): GpkgSpot => ({
  types: ["papa"], placers: ["Ana"], reporter: "Beto", place_name: "Madrid", country_code: "es", taken_at: null,
  created_at: "2026-02-24T00:14:34.863Z", status: "published", note: null, photo: null, ...over,
});

const SPOTS: GpkgSpot[] = [
  spot({ id: "A", lat: 40.4169, lng: -3.7035, types: ["papa", "sexo-punto"], placers: ["Beto", "Caro"], photo: "/api/admin/img/display/A.webp" }),
  spot({ id: "B", lat: -34.9061, lng: -56.1993, types: ["otro"], placers: [], reporter: null, note: "con ñ y \"comillas\"" }),
  spot({ id: "C", lat: 31.23, lng: 121.47, types: ["sexo-punto"], status: "hidden" }),
];
const TYPES = [{ slug: "papa" }, { slug: "sexo-punto" }, { slug: "otro" }, { slug: "sexo-pregunta" }];

function open(bytes: Uint8Array) {
  const db = new SQL.Database(bytes);
  const all = (sql: string): SqlValue[][] => db.exec(sql)[0]?.values ?? [];
  return { db, all };
}

describe("buildGeoPackage", () => {
  let bytes: Uint8Array;
  let all: (sql: string) => SqlValue[][];
  beforeAll(() => {
    bytes = buildGeoPackage(SQL, SPOTS, TYPES, { origin: "https://mapa.example", now: new Date("2026-10-23T12:00:00Z") });
    all = open(bytes).all;
  });

  it("is a SQLite file stamped as GeoPackage 1.3", () => {
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe("SQLite format 3");
    expect(all("PRAGMA application_id")[0]?.[0]).toBe(GPKG_APPLICATION_ID);
    expect(all("PRAGMA user_version")[0]?.[0]).toBe(GPKG_USER_VERSION);
  });

  it("keeps one row per spot", () => {
    expect(all("SELECT COUNT(*) FROM spots")[0]?.[0]).toBe(3);
    expect(all("SELECT id FROM spots ORDER BY fid").map((r) => r[0])).toEqual(["A", "B", "C"]);
  });

  it("stores each geometry as a GP header (srs 4326) plus a WKB point", () => {
    const rows = all("SELECT id, geom FROM spots ORDER BY fid");
    for (const [, geom] of rows) {
      const blob = geom as Uint8Array;
      expect(blob.length).toBe(29);
      expect(String.fromCharCode(blob[0]!, blob[1]!)).toBe("GP");
      expect(blob[2]).toBe(0);
      const v = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
      expect(v.getInt32(4, true)).toBe(4326);
    }
    const a = rows[0]![1] as Uint8Array;
    const v = new DataView(a.buffer, a.byteOffset, a.byteLength);
    expect(v.getUint8(8)).toBe(1);
    expect(v.getUint32(9, true)).toBe(1);
    expect(v.getFloat64(13, true)).toBe(-3.7035);
    expect(v.getFloat64(21, true)).toBe(40.4169);
  });

  it("registers the layer in gpkg_contents and gpkg_geometry_columns", () => {
    const contents = all("SELECT table_name, data_type, identifier, min_x, min_y, max_x, max_y, srs_id FROM gpkg_contents");
    expect(contents).toEqual([["spots", "features", "spots", -56.1993, -34.9061, 121.47, 40.4169, 4326]]);
    expect(all("SELECT * FROM gpkg_geometry_columns")).toEqual([["spots", "geom", "POINT", 4326, 0, 0]]);
    expect(all("SELECT srs_id, organization FROM gpkg_spatial_ref_sys ORDER BY srs_id")).toEqual([[-1, "NONE"], [0, "NONE"], [4326, "EPSG"]]);
  });

  it("writes the joined types plus one boolean column per type", () => {
    const rows = all("SELECT id, types, papa, sexo_punto, otro, sexo_pregunta FROM spots ORDER BY fid");
    expect(rows[0]).toEqual(["A", "papa;sexo-punto", 1, 1, 0, 0]);
    expect(rows[1]).toEqual(["B", "otro", 0, 0, 1, 0]);
    expect(rows[2]).toEqual(["C", "sexo-punto", 0, 1, 0, 0]);
  });

  it("copies the attributes of the owner's layout", () => {
    const [a, b] = all("SELECT placers, reporter, place_name, country_code, created_at, status, note, photo_url FROM spots ORDER BY fid");
    expect(a).toEqual(["Beto;Caro", "Beto", "Madrid", "es", "2026-02-24T00:14:34.863Z", "published", null, "https://mapa.example/img/display/A.webp"]);
    expect(b?.[1]).toBeNull();
    expect(b?.[6]).toBe('con ñ y "comillas"');
    expect(b?.[7]).toBeNull();
  });

  it("builds an empty layer without breaking the bounding box", () => {
    const empty = open(buildGeoPackage(SQL, [], TYPES));
    expect(empty.all("SELECT COUNT(*) FROM spots")[0]?.[0]).toBe(0);
    expect(empty.all("SELECT min_x, max_x FROM gpkg_contents")[0]).toEqual([null, null]);
    expect(empty.all("SELECT COUNT(*) FROM gpkg_geometry_columns")[0]?.[0]).toBe(1);
  });
});

describe("helpers", () => {
  it("pointBlob is header + WKB", () => {
    const b = pointBlob(1.5, -2.5);
    expect([b[0], b[1]]).toEqual([0x47, 0x50]);
    expect(new DataView(b.buffer).getInt32(4, true)).toBe(4326);
  });

  it("typeColumn sanitises slugs and avoids clashes", () => {
    expect(typeColumn("sexo-pregunta-og", new Set())).toBe("sexo_pregunta_og");
    expect(typeColumn("status", new Set())).toBe("status_tipo");
    expect(typeColumn("papa", new Set(["papa"]))).toBe("papa_tipo");
    expect(typeColumn("---", new Set())).toBe("tipo");
  });

  it("publicPhotoUrl maps the admin image route to the public one", () => {
    expect(publicPhotoUrl("/api/admin/img/display/A.webp", "https://x.test")).toBe("https://x.test/img/display/A.webp");
    expect(publicPhotoUrl(null, "https://x.test")).toBeNull();
  });
});
