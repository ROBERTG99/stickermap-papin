import { describe, expect, it } from "vitest";
import { clampWindow, defaultWindow, formatClock, locationFromRawTags, outputSize, parseIso6709 } from "../../src/lib/video-meta";

describe("trim window", () => {
  it("starts with the first 15 seconds", () => {
    expect(defaultWindow(40_000)).toEqual({ startMs: 0, endMs: 15_000 });
    expect(defaultWindow(8_200)).toEqual({ startMs: 0, endMs: 8_200 });
  });
  it("never exceeds 15 s: moving one end drags the other", () => {
    expect(clampWindow({ startMs: 0, endMs: 40_000 }, 40_000, "end")).toEqual({ startMs: 25_000, endMs: 40_000 });
    expect(clampWindow({ startMs: 10_000, endMs: 15_000 }, 40_000, "start")).toEqual({ startMs: 10_000, endMs: 15_000 });
    expect(clampWindow({ startMs: 30_000, endMs: 15_000 }, 40_000, "start").endMs).toBeGreaterThan(30_000);
  });
  it("stays inside the clip and keeps a minimum length", () => {
    expect(clampWindow({ startMs: -50, endMs: 99_999 }, 10_000, "end")).toEqual({ startMs: 0, endMs: 10_000 });
    const tiny = clampWindow({ startMs: 4_900, endMs: 5_000 }, 10_000, "end");
    expect(tiny.endMs - tiny.startMs).toBeGreaterThanOrEqual(500);
  });
  it("formats minutes and seconds", () => {
    expect(formatClock(42_000)).toBe("0:42");
    expect(formatClock(75_400)).toBe("1:15");
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("output size", () => {
  it("caps the long edge at 1280 and keeps even sizes", () => {
    expect(outputSize(3840, 2160)).toEqual({ width: 1280, height: 720 });
    expect(outputSize(2160, 3840)).toEqual({ width: 720, height: 1280 });
    expect(outputSize(640, 480)).toEqual({ width: 640, height: 480 });
    expect(outputSize(1001, 563).width % 2).toBe(0);
  });
});

describe("video location (ISO 6709)", () => {
  it("parses what iPhones and Android write", () => {
    expect(parseIso6709("+40.7642-073.9787/")).toEqual({ lat: 40.7642, lng: -73.9787 });
    expect(parseIso6709("-34.9061+056.1993+012.5/")).toEqual({ lat: -34.9061, lng: 56.1993 });
  });
  it("rejects nonsense and null island", () => {
    for (const bad of ["", "hola", "+95.0000+010.0000/", "+10.0000+190.0000/", "+00.0000+000.0000/"]) expect(parseIso6709(bad)).toBeNull();
  });
  it("finds it in the raw container tags, as text or bytes", () => {
    expect(locationFromRawTags({ "com.apple.quicktime.location.ISO6709": "+40.7642-073.9787+012.000/" })).toEqual({ lat: 40.7642, lng: -73.9787 });
    expect(locationFromRawTags({ "©xyz": new TextEncoder().encode("\u0000\u0012\u0015Ç+40.7642-073.9787/") })).toEqual({ lat: 40.7642, lng: -73.9787 });
    expect(locationFromRawTags({ title: "x" })).toBeNull();
    expect(locationFromRawTags(undefined)).toBeNull();
  });
});
