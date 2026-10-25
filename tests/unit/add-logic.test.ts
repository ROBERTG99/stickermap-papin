import { describe, expect, it } from "vitest";
import {
  buildMeta, buildPatch, checkPhotoFile, classifySubmitError, firstInvalidCard, isFreshPhoto, isLocationConflict, keepsDraft, MAX_PHOTO_BYTES,
  instagramProblems, photoMime, planLocation, uniqueNames, validateAdd, type EditSnapshot, type LocationChoice, type MetaInput, type ValidationInput,
} from "../../src/add/logic";
import { createSpotMeta } from "../../src/shared/schema";

const NOW = new Date("2026-10-23T12:00:00").getTime();
const pinAt: LocationChoice = { lat: -34.9061234, lng: -56.1993456, source: "pin", accuracyM: null };

describe("photo files", () => {
  it("accepts JPEG, PNG, WebP, HEIC and HEIF by type or by extension", () => {
    expect(photoMime({ name: "a.jpg", type: "image/jpeg" })).toBe("image/jpeg");
    expect(photoMime({ name: "a.JPG", type: "" })).toBe("image/jpeg");
    expect(photoMime({ name: "IMG_1.HEIC", type: "" })).toBe("image/heic");
    expect(photoMime({ name: "x.heif", type: "image/heif" })).toBe("image/heif");
    expect(photoMime({ name: "x", type: "image/png" })).toBe("image/png");
    expect(photoMime({ name: "x.webp", type: "" })).toBe("image/webp");
    expect(photoMime({ name: "x.gif", type: "image/gif" })).toBeNull();
    expect(photoMime({ name: "x.svg", type: "image/svg+xml" })).toBeNull();
  });

  it("rejects wrong types and anything over 25 MB", () => {
    expect(checkPhotoFile({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toEqual({ ok: true, mime: "image/jpeg" });
    expect(checkPhotoFile({ name: "a.jpg", type: "image/jpeg", size: MAX_PHOTO_BYTES })).toMatchObject({ ok: true });
    expect(checkPhotoFile({ name: "a.jpg", type: "image/jpeg", size: MAX_PHOTO_BYTES + 1 })).toEqual({ ok: false, reason: "too_big" });
    expect(checkPhotoFile({ name: "a.pdf", type: "application/pdf", size: 10 })).toEqual({ ok: false, reason: "bad_type" });
  });
});

describe("where the location comes from (BUILD.md 7.3)", () => {
  it("fresh = EXIF date within 10 minutes of now, or no EXIF date at all", () => {
    expect(isFreshPhoto(null, NOW)).toBe(true);
    expect(isFreshPhoto("2026-10-23T11:55:00", NOW)).toBe(true);
    expect(isFreshPhoto("2026-10-23T11:50:00", NOW)).toBe(true);
    expect(isFreshPhoto("2026-10-23T11:49:59", NOW)).toBe(false);
    expect(isFreshPhoto("2023-08-02T10:31:01", NOW)).toBe(false);
    expect(isFreshPhoto("garbage", NOW)).toBe(true);
  });

  it("uses the photo GPS first, whatever the source", () => {
    expect(planLocation({ hasGps: true, viaCamera: true, takenAt: "2026-10-23T11:59:00" }, NOW)).toBe("exif");
    expect(planLocation({ hasGps: true, viaCamera: false, takenAt: "2020-01-01T00:00:00" }, NOW)).toBe("exif");
  });

  it("asks the device only for a fresh camera photo without GPS", () => {
    expect(planLocation({ hasGps: false, viaCamera: true, takenAt: "2026-10-23T11:59:00" }, NOW)).toBe("device");
    expect(planLocation({ hasGps: false, viaCamera: true, takenAt: null }, NOW)).toBe("device");
  });

  it("never uses the device for a gallery photo, nor for an old camera photo", () => {
    expect(planLocation({ hasGps: false, viaCamera: false, takenAt: null }, NOW)).toBe("manual");
    expect(planLocation({ hasGps: false, viaCamera: false, takenAt: "2026-10-23T11:59:00" }, NOW)).toBe("manual");
    expect(planLocation({ hasGps: false, viaCamera: true, takenAt: "2023-08-02T10:31:01" }, NOW)).toBe("manual");
  });

  it("flags a conflict only above 50 km", () => {
    const shanghai = { lat: 31.2304, lng: 121.4737 };
    const auburn = { lat: 32.6099, lng: -85.4808 };
    expect(isLocationConflict(shanghai, auburn)).toBe(true);
    const a = { lat: -34.9, lng: -56.16 };
    expect(isLocationConflict(a, { lat: -34.95, lng: -56.2 })).toBe(false);
    expect(isLocationConflict(a, { lat: -35.5, lng: -56.16 })).toBe(true); // about 66 km
  });
});

describe("what blocks Mandale Mecha", () => {
  const ok: ValidationInput = { photoBusy: false, location: pinAt, locationBusy: false, types: ["papa"] };

  it("passes with a type and a confirmed location", () => {
    expect(validateAdd(ok)).toEqual([]);
  });

  it("needs a location and a type, in card order", () => {
    const issues = validateAdd({ ...ok, location: null, types: [] });
    expect(issues.map((i) => i.code)).toEqual(["no_location", "no_type"]);
    expect(firstInvalidCard(issues)).toBe(2);
    expect(firstInvalidCard(validateAdd({ ...ok, types: [] }))).toBe(3);
    expect(firstInvalidCard([])).toBeNull();
  });

  it("blocks a typed Instagram handle or post link that would be rejected", () => {
    expect(validateAdd({ ...ok, badInstagram: true }).map((i) => i.code)).toEqual(["bad_instagram"]);
    expect(instagramProblems("no..good", "")).toEqual({ handle: true, post: false });
    expect(instagramProblems("", "https://example.com/p/a")).toEqual({ handle: false, post: true });
    expect(instagramProblems("  ", "")).toEqual({ handle: false, post: false });
  });

  it("waits for the photo to be read", () => {
    expect(validateAdd({ ...ok, photoBusy: true })).toEqual([{ card: 1, code: "photo_busy" }]);
  });
});

describe("request body", () => {
  const base: MetaInput = {
    location: pinAt, approximate: false, types: ["papa", "otro"], otherText: "  el de la vaca ", soy: " Ana ",
    note: "  arriba del secamanos ", takenAt: "2023-08-02T10:31:01", photoSha256: "a".repeat(64), turnstileToken: "tok",
  };

  it("matches the server schema", () => {
    const meta = buildMeta(base);
    expect(createSpotMeta.safeParse(meta).success).toBe(true);
    expect(meta).toMatchObject({
      lat: -34.9061234, lng: -56.1993456, location_source: "pin", location_accuracy_m: null, is_approximate: false, types: ["papa", "otro"],
      other_text: "el de la vaca", reporter: "Ana", note: "arriba del secamanos", turnstile_token: "tok",
    });
  });

  it("rounds to 3 decimals when approximate", () => {
    const meta = buildMeta({ ...base, approximate: true });
    expect(meta).toMatchObject({ lat: -34.906, lng: -56.199, is_approximate: true });
  });

  it("keeps the accuracy of a device or EXIF fix", () => {
    const meta = buildMeta({ ...base, location: { lat: 1, lng: 2, source: "device", accuracyM: 12.345 } });
    expect(meta).toMatchObject({ location_source: "device", location_accuracy_m: 12.3 });
  });

  it("anonymous reporter is null", () => {
    const anon = buildMeta({ ...base, soy: "  " });
    expect(anon.reporter).toBeNull();
    expect(createSpotMeta.safeParse(anon).success).toBe(true);
  });

  it("sends the normalized Instagram handle and post link, only with a reporter", () => {
    const meta = buildMeta({ ...base, instagram: " @Ana.Papa ", postUrl: "instagram.com/reel/C8xQ2p?igsh=1" });
    expect(meta).toMatchObject({ reporter_instagram: "ana.papa", instagram_post_url: "https://www.instagram.com/reel/C8xQ2p/" });
    expect(createSpotMeta.safeParse(meta).success).toBe(true);
    expect(buildMeta({ ...base, soy: "", instagram: "ana.papa" }).reporter_instagram).toBeNull();
  });

  it("blank optional text becomes null", () => {
    const meta = buildMeta({ ...base, otherText: "   ", note: "" });
    expect(meta.other_text).toBeNull();
    expect(meta.note).toBeNull();
  });

  it("uniqueNames keeps the first spelling", () => {
    expect(uniqueNames(["Ana", "ana", "  Caro  ", ""])).toEqual(["Ana", "Caro"]);
  });
});

describe("server errors", () => {
  it("maps statuses to the messages we have", () => {
    expect(classifySubmitError(0, "offline")).toBe("network");
    expect(classifySubmitError(409, "photo_exists")).toBe("exists");
    expect(classifySubmitError(429, "rate_limited")).toBe("rate_limited");
    expect(classifySubmitError(403, "turnstile_failed")).toBe("turnstile");
    expect(classifySubmitError(413, "too_large")).toBe("too_large");
    expect(classifySubmitError(415, "bad_image")).toBe("bad_image");
    expect(classifySubmitError(400, "invalid")).toBe("invalid");
    expect(classifySubmitError(502, "storage_failed")).toBe("server");
  });

  it("keeps the draft for everything but a duplicate photo", () => {
    expect(keepsDraft("network")).toBe(true);
    expect(keepsDraft("rate_limited")).toBe(true);
    expect(keepsDraft("exists")).toBe(false);
  });
});

describe("edit patch", () => {
  const before: EditSnapshot = {
    lat: -34.9, lng: -56.16, approximate: false, types: ["papa"], otherText: "", note: "",
  };

  it("is empty when nothing changed", () => {
    expect(buildPatch(before, { ...before }, false)).toEqual({});
  });

  it("sends only what changed", () => {
    expect(buildPatch(before, { ...before, note: " hola " }, false)).toEqual({ note: "hola" });
    expect(buildPatch(before, { ...before, lat: -34.91, lng: -56.17 }, false)).toEqual({ lat: -34.91, lng: -56.17 });
    expect(buildPatch(before, { ...before, approximate: true }, false)).toEqual({ is_approximate: true });
  });

  it("types and the free text of Otro go together", () => {
    expect(buildPatch(before, { ...before, types: ["papa", "otro"], otherText: " la vaca " }, true)).toEqual({ types: ["papa", "otro"], other_text: "la vaca" });
    expect(buildPatch({ ...before, types: ["otro"], otherText: "x" }, { ...before, types: ["papa"], otherText: "x" }, false)).toEqual({ types: ["papa"], other_text: null });
  });
});
