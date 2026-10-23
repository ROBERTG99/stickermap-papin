import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { getPlatformProxy } from "wrangler";
import { newUlid } from "../../src/shared/ulid";

/** The slice of the D1 and R2 bindings this seed uses (the Workers types conflict with the DOM types of the e2e project). */
interface Stmt { bind(...values: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null> } }
interface D1 { prepare(sql: string): Stmt }
interface R2 { put(key: string, value: Buffer | Uint8Array, options?: { httpMetadata: { contentType: string } }): Promise<unknown> }

interface Seeded { id: string; lat: number; lng: number; types: string[]; place: string; cc: string; country: string; reporter?: string; placers?: string[]; hasPhoto: boolean }

/** A few spots around the world: one with two types, one with an unknown placer, one with several placers, one without photo. */
export const SEED: Omit<Seeded, "id">[] = [
  { lat: -34.9061, lng: -56.1993, types: ["papa"], place: "Montevideo", cc: "uy", country: "Uruguay", reporter: "Ana", placers: ["Ana"], hasPhoto: true },
  { lat: -34.9055, lng: -56.2003, types: ["sexo-punto", "papa"], place: "Montevideo", cc: "uy", country: "Uruguay", reporter: "Beto", placers: ["Beto", "Caro"], hasPhoto: true },
  { lat: -34.6037, lng: -58.3816, types: ["sexo-pregunta"], place: "Buenos Aires", cc: "ar", country: "Argentina", reporter: "Caro", placers: ["Caro"], hasPhoto: true },
  { lat: 40.4168, lng: -3.7038, types: ["papa"], place: "Madrid", cc: "es", country: "España", reporter: "Ana", placers: [], hasPhoto: true },
  { lat: 48.8566, lng: 2.3522, types: ["otro"], place: "París", cc: "fr", country: "Francia", hasPhoto: false },
  { lat: 40.7128, lng: -74.006, types: ["sexo-punto"], place: "Nueva York", cc: "us", country: "Estados Unidos", reporter: "Beto", placers: ["Beto"], hasPhoto: true },
  { lat: 31.2304, lng: 121.4737, types: ["papa"], place: "Shanghái", cc: "cn", country: "China", reporter: "Ana", placers: ["Ana"], hasPhoto: true },
  { lat: -33.4489, lng: -70.6693, types: ["sexo-pregunta", "sexo-punto"], place: "Santiago", cc: "cl", country: "Chile", reporter: "Caro", placers: ["Caro", "Ana"], hasPhoto: true },
];

export async function seed(persistPath: string): Promise<Seeded[]> {
  const proxy = await getPlatformProxy<{ DB: D1; PHOTOS: R2 }>({ configPath: "wrangler.jsonc", persist: { path: `${persistPath}/v3` } });
  const { DB, PHOTOS } = proxy.env;
  for (const slug of ["papa", "sexo-punto", "sexo-pregunta", "sexo-pregunta-og", "otro"]) {
    await PHOTOS.put(`icons/${slug}.png`, await readFile(`investigation/icons/${slug}.png`), { httpMetadata: { contentType: "image/png" } });
  }
  const out: Seeded[] = [];
  const people = new Map<string, number>();
  const person = async (name: string) => {
    if (!people.has(name)) {
      await DB.prepare("INSERT OR IGNORE INTO people (display_name) VALUES (?1)").bind(name).run();
      people.set(name, (await DB.prepare("SELECT id FROM people WHERE display_name = ?1").bind(name).first<{ id: number }>())!.id);
    }
    return people.get(name)!;
  };
  for (const [i, s] of SEED.entries()) {
    const id = newUlid(Date.UTC(2025, 3, 15 + i));
    const at = new Date(Date.UTC(2025, 3, 15 + i, 12)).toISOString();
    const reporterId = s.reporter ? await person(s.reporter) : null;
    const status = s.placers === undefined || s.placers.length === 0 ? "unknown" : s.placers.length === 1 && s.placers[0] === s.reporter ? "self" : "other";
    let photo: string | null = null, thumb: string | null = null;
    if (s.hasPhoto) {
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="hsl(${i * 40},50%,60%)"/><text x="40" y="300" font-size="64" fill="white">${s.place}</text></svg>`);
      photo = `display/${id}.webp`; thumb = `thumb/${id}.webp`;
      await PHOTOS.put(photo, await sharp(svg).webp().toBuffer(), { httpMetadata: { contentType: "image/webp" } });
      await PHOTOS.put(thumb, await sharp(svg).resize(400).webp().toBuffer(), { httpMetadata: { contentType: "image/webp" } });
    }
    await DB.prepare(
      "INSERT INTO spots (id, lat, lng, location_source, reporter_person_id, reporter_raw, placer_status, place_name, country, country_code, photo_key, thumb_key, created_at, updated_at, status) VALUES (?1,?2,?3,'pin',?4,?5,?6,?7,?8,?9,?10,?11,?12,?12,'published')",
    ).bind(id, s.lat, s.lng, reporterId, s.reporter ?? null, status, s.place, s.country, s.cc, photo, thumb, at).run();
    for (const t of s.types) await DB.prepare("INSERT INTO spot_types (spot_id, type_slug) VALUES (?1, ?2)").bind(id, t).run();
    for (const p of s.placers ?? []) await DB.prepare("INSERT INTO spot_placers (spot_id, person_id) VALUES (?1, ?2)").bind(id, await person(p)).run();
    out.push({ ...s, id });
  }
  await proxy.dispose();
  return out;
}
