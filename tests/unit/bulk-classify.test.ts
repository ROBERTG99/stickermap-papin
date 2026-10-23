import { describe, expect, it } from "vitest";
import { classifyMetas, classifyPhotos, summarizeDraft, type ClassifyInput } from "../../src/add/bulk/classify";
import type { PhotoMeta } from "../../src/add/bulk/types";

const photo = (over: Partial<ClassifyInput> = {}): ClassifyInput => ({ sha256: null, lat: null, lng: null, error: null, existsId: null, ...over });
const status = (...ps: ClassifyInput[]) => classifyPhotos(ps).map((c) => c.status);

describe("classifyPhotos", () => {
  it("is ready with a valid GPS fix that is not a duplicate", () => {
    expect(status(photo({ sha256: "a", lat: -34.9, lng: -56.16 }))).toEqual(["ready"]);
  });

  it("treats a missing, 0,0 or out-of-range location as no location", () => {
    expect(status(
      photo({ sha256: "a" }),
      photo({ sha256: "b", lat: 0, lng: 0 }),
      photo({ sha256: "c", lat: 91, lng: 10 }),
      photo({ sha256: "d", lat: 10, lng: -181 }),
      photo({ sha256: "e", lat: Number.NaN, lng: 3 }),
    )).toEqual(["no-location", "no-location", "no-location", "no-location", "no-location"]);
  });

  it("marks a hash that is already on the map as exists, even with a location", () => {
    const [c] = classifyPhotos([photo({ sha256: "a", lat: -34.9, lng: -56.16, existsId: "spot1" })]);
    expect(c?.status).toBe("exists");
  });

  it("keeps only the first photo of a repeated hash and points the others at it", () => {
    const out = classifyPhotos([
      photo({ sha256: "a", lat: 1, lng: 1 }),
      photo({ sha256: "b", lat: 2, lng: 2 }),
      photo({ sha256: "a", lat: 1, lng: 1 }),
      photo({ sha256: "a", lat: 1, lng: 1 }),
    ]);
    expect(out.map((c) => c.status)).toEqual(["ready", "ready", "dup-batch", "dup-batch"]);
    expect(out[2]?.sameAs).toBe(0);
    expect(out[3]?.sameAs).toBe(0);
  });

  it("reports unreadable files as error whatever else they carry", () => {
    expect(status(photo({ sha256: "a", lat: 1, lng: 1, error: "cant-open" }))).toEqual(["error"]);
  });

  it("does not let an unreadable file shadow a later copy of the same hash", () => {
    expect(status(photo({ sha256: "a", error: "cant-open" }), photo({ sha256: "a", lat: 1, lng: 1 }))).toEqual(["error", "ready"]);
  });

  it("lets the user's Omitir win over ready and no-location but not over the automatic skips", () => {
    expect(status(
      photo({ sha256: "a", lat: 1, lng: 1, omitted: true }),
      photo({ sha256: "b", omitted: true }),
      photo({ sha256: "c", lat: 1, lng: 1, existsId: "x", omitted: true }),
    )).toEqual(["omitted", "omitted", "exists"]);
  });

  it("never invents a location: a photo without GPS stays no-location whatever its neighbours have", () => {
    expect(status(photo({ sha256: "a", lat: -34.9, lng: -56.16 }), photo({ sha256: "b" }))).toEqual(["ready", "no-location"]);
  });
});

const meta = (over: Partial<PhotoMeta>): PhotoMeta => ({
  id: "x", seq: 0, name: "x.jpg", size: 1, sha256: null, lat: null, lng: null, accuracyM: null, takenAt: null, error: null,
  hasOriginal: true, existsId: null, placed: null, omitted: false, override: {}, upload: { state: "idle" }, ...over,
});

describe("summarizeDraft", () => {
  it("counts the photos waiting for a hand-placed location", () => {
    const photos = [
      meta({ id: "a", sha256: "a", lat: 1, lng: 1 }),
      meta({ id: "b", sha256: "b" }),
      meta({ id: "c", sha256: "c", placed: { lat: 2, lng: 2, source: "pin" } }),
      meta({ id: "d", sha256: "d", omitted: true }),
    ];
    expect(summarizeDraft("review", photos)).toEqual({ unplaced: 1, unfinished: null });
  });

  it("reports an upload that did not finish", () => {
    const photos = [
      meta({ id: "a", sha256: "a", lat: 1, lng: 1, upload: { state: "done", send: 1 } }),
      meta({ id: "b", sha256: "b", lat: 1, lng: 1, upload: { state: "queued", send: 1 } }),
      meta({ id: "c", sha256: "c", lat: 1, lng: 1, upload: { state: "failed", send: 1 } }),
    ];
    expect(summarizeDraft("uploading", photos, 1)).toEqual({ unplaced: 0, unfinished: { done: 1, total: 3 } });
  });

  it("is quiet once everything went up", () => {
    const photos = [meta({ id: "a", sha256: "a", lat: 1, lng: 1, upload: { state: "done", send: 1 } })];
    expect(summarizeDraft("done", photos, 1)).toEqual({ unplaced: 0, unfinished: null });
  });
});

describe("classifyMetas", () => {
  it("does not offer a copy of a photo that already went up", () => {
    const a = meta({ id: "a", sha256: "h", lat: 1, lng: 1, upload: { state: "done", spotId: "s1", send: 1 } });
    const copy = meta({ id: "b", sha256: "h", lat: 1, lng: 1 });
    expect(classifyMetas([a, copy]).map((c) => c.status)).toEqual(["exists", "exists"]);
  });
});
