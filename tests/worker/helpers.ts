import { env, exports } from "cloudflare:workers";
import { vi } from "vitest";

export const call = (path: string, init?: RequestInit) =>
  (exports as unknown as { default: { fetch(r: Request): Promise<Response> } }).default.fetch(new Request(`https://stickermap.test${path}`, init));

/** Smallest byte strings that pass the server's magic-byte sniffing. */
export const WEBP = (size = 64) => new Uint8Array([...new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "), ...new Array(Math.max(0, size - 16)).fill(7)]);
export const JPEG = (size = 64) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(Math.max(0, size - 4)).fill(9)]);

/** Answer Cloudflare's siteverify like Turnstile would: `ok` -> success, otherwise a failure. */
export function mockTurnstile(ok: boolean) {
  const real = globalThis.fetch;
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.startsWith("https://challenges.cloudflare.com/")) {
      return Response.json(ok ? { success: true, hostname: "stickermap.test" } : { success: false, "error-codes": ["invalid-input-response"] });
    }
    return real(input, init);
  });
}

export interface SpotInput { meta: Record<string, unknown>; display?: Uint8Array | null; thumb?: Uint8Array | null; original?: Uint8Array | null }

export function spotForm({ meta, display = WEBP(), thumb = WEBP(), original }: SpotInput): FormData {
  const form = new FormData();
  form.set("meta", JSON.stringify({ lat: -34.9, lng: -56.16, location_source: "pin", types: ["papa"], placer_status: "unknown", turnstile_token: "tok", ...meta }));
  if (display) form.set("display", new File([display.slice().buffer], "d.webp", { type: "image/webp" }));
  if (thumb) form.set("thumb", new File([thumb.slice().buffer], "t.webp", { type: "image/webp" }));
  if (original) form.set("original", new File([original.slice().buffer], "o.jpg", { type: "image/jpeg" }));
  return form;
}

export const db = () => env.DB;
export const bucket = () => env.PHOTOS;

/** The plugin does not isolate storage between tests of a file: start every test from the seeded schema only. */
export async function resetState(): Promise<void> {
  await db().batch([
    db().prepare("DELETE FROM spot_placers"), db().prepare("DELETE FROM spot_types"), db().prepare("DELETE FROM spots"),
    db().prepare("DELETE FROM batches"), db().prepare("DELETE FROM people_aliases"), db().prepare("DELETE FROM people"),
    db().prepare("DELETE FROM submissions_rl"), db().prepare("DELETE FROM audit_log"), db().prepare("DELETE FROM geocode_cache"),
    db().prepare("UPDATE settings SET value = '0' WHERE key = 'r2_bytes'"),
    db().prepare("UPDATE settings SET value = 'open' WHERE key = 'moderation_mode'"),
    db().prepare("DELETE FROM settings WHERE key = 'geocode_backoff_until'"),
  ]);
  let cursor: string | undefined;
  do {
    const page = await bucket().list({ cursor });
    if (page.objects.length) await bucket().delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
