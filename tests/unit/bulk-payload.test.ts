import { describe, expect, it } from "vitest";
import { batchProblem, buildSpotMeta, clockOf } from "../../src/add/bulk/effective";
import { backoffMs, interpretUploadError } from "../../src/add/bulk/upload";
import type { BulkDefaults, PhotoMeta } from "../../src/add/bulk/types";
import { ApiError } from "../../src/lib/api";
import { createSpotMeta } from "../../src/shared/schema";

const defaults = (over: Partial<BulkDefaults> = {}): BulkDefaults => ({
  types: ["papa"], otherText: "", placer: { status: "self", placers: ["Ana"] }, soy: "Ana", approximate: false, originals: true, ...over,
});
const photo = (over: Partial<PhotoMeta> = {}): PhotoMeta => ({
  id: "01HZZZZZZZZZZZZZZZZZZZZZZZ", seq: 0, name: "a.jpg", size: 1000, sha256: "a".repeat(64), lat: -34.9, lng: -56.16, accuracyM: 5,
  takenAt: "2024-05-01T10:31:01", error: null, hasOriginal: true, existsId: null, placed: null, omitted: false, override: {}, upload: { state: "idle" }, ...over,
});
const allowsText = (slug: string) => slug === "otro";

describe("buildSpotMeta", () => {
  it("produces a body the Worker's schema accepts (EXIF location)", () => {
    const meta = buildSpotMeta(photo(), defaults(), allowsText);
    const parsed = createSpotMeta.safeParse(meta);
    expect(parsed.success).toBe(true);
    expect(meta).toMatchObject({ location_source: "exif", location_accuracy_m: 5, client_ref: "01HZZZZZZZZZZZZZZZZZZZZZZZ", placer_status: "self", placers: [], reporter: "Ana" });
    expect(meta).not.toHaveProperty("turnstile_token");
  });

  it("uses the hand-placed pin and its source, with no accuracy", () => {
    const meta = buildSpotMeta(photo({ lat: null, lng: null, accuracyM: null, placed: { lat: 40.4, lng: -3.7, source: "search" } }), defaults(), allowsText);
    expect(meta).toMatchObject({ lat: 40.4, lng: -3.7, location_source: "search", location_accuracy_m: null });
    expect(createSpotMeta.safeParse(meta).success).toBe(true);
  });

  it("returns null for a photo that has no location at all (never borrows one)", () => {
    expect(buildSpotMeta(photo({ lat: null, lng: null }), defaults(), allowsText)).toBeNull();
  });

  it("applies per-photo overrides over the batch defaults", () => {
    const meta = buildSpotMeta(
      photo({ override: { types: ["otro"], otherText: "la vaca", placer: { status: "other", placers: ["Beto", "Hugo"] }, note: "  en la columna  " } }),
      defaults(), allowsText,
    );
    expect(meta).toMatchObject({ types: ["otro"], other_text: "la vaca", placer_status: "other", placers: ["Beto", "Hugo"], note: "en la columna" });
    expect(createSpotMeta.safeParse(meta).success).toBe(true);
  });

  it("sends other_text only for types that allow it", () => {
    expect(buildSpotMeta(photo(), defaults({ otherText: "ignorado" }), allowsText)).toMatchObject({ other_text: null });
  });

  it("keeps unknown placers valid and trims the placer note", () => {
    const meta = buildSpotMeta(photo(), defaults({ placer: { status: "unknown", placers: [], note: "x".repeat(300) } }), allowsText);
    expect((meta as { placer_note: string }).placer_note).toHaveLength(140);
    expect(createSpotMeta.safeParse(meta).success).toBe(true);
  });

  it("falls back to unknown when 'Yo' has no reporter", () => {
    const meta = buildSpotMeta(photo(), defaults({ soy: "", placer: { status: "self", placers: [] } }), allowsText);
    expect(meta).toMatchObject({ placer_status: "unknown", reporter: null });
    expect(createSpotMeta.safeParse(meta).success).toBe(true);
  });

  it("rounds nothing itself: approximate is a flag the server applies", () => {
    expect(buildSpotMeta(photo(), defaults({ approximate: true }), allowsText)).toMatchObject({ is_approximate: true, lat: -34.9, lng: -56.16 });
  });
});

describe("batchProblem", () => {
  it("asks for a type first", () => {
    expect(batchProblem(defaults({ types: [] }), 5, allowsText)).toBe("type");
  });
  it("asks what 'Otro' is", () => {
    expect(batchProblem(defaults({ types: ["otro"], otherText: " " }), 5, allowsText)).toBe("other");
  });
  it("needs at least one name for Otro/s", () => {
    expect(batchProblem(defaults({ placer: { status: "other", placers: [] } }), 5, allowsText)).toBe("placer");
  });
  it("needs at least one ready photo", () => {
    expect(batchProblem(defaults(), 0, allowsText)).toBe("none");
    expect(batchProblem(defaults(), 3, allowsText)).toBeNull();
  });
});

describe("interpretUploadError", () => {
  const err = (status: number, code: string, body?: unknown) => new ApiError(status, code, body);
  it("retries offline and server errors", () => {
    expect(interpretUploadError(err(0, "offline"))).toEqual({ kind: "retry", code: "offline" });
    expect(interpretUploadError(err(503, "error"))).toEqual({ kind: "retry", code: "server" });
  });
  it("counts a 409 photo_exists as already on the map", () => {
    expect(interpretUploadError(err(409, "photo_exists", { id: "spot9" }))).toEqual({ kind: "exists", id: "spot9" });
  });
  it("renews the batch on an expired token", () => {
    expect(interpretUploadError(err(401, "invalid_batch_token"))).toEqual({ kind: "renew" });
  });
  it("does not retry what cannot work", () => {
    expect(interpretUploadError(err(409, "batch_full")).kind).toBe("fail");
    expect(interpretUploadError(err(415, "bad_image")).kind).toBe("fail");
    expect(interpretUploadError(err(429, "rate_limited")).kind).toBe("fail");
  });
  it("backs off exponentially", () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([1000, 2000, 4000]);
  });
});

describe("clockOf", () => {
  it("shows HH:MM of the naive EXIF time", () => {
    expect(clockOf("2024-05-01T10:31:01")).toBe("10:31");
    expect(clockOf(null)).toBeNull();
  });
});
