import { describe, expect, it } from "vitest";
import { parseCoordinates, parseLocationText } from "../../src/lib/geo-parse";

function at(input: string) {
  const r = parseLocationText(input);
  if (!r.ok) throw new Error(`expected a location for "${input}", got ${r.reason}`);
  return r;
}

describe("decimal coordinates", () => {
  it.each([
    ["-34.9, -56.16", -34.9, -56.16],
    ["-34.9,-56.16", -34.9, -56.16],
    ["-34.9 -56.16", -34.9, -56.16],
    ["-34.9; -56.16", -34.9, -56.16],
    ["  -34.9061 ,  -56.1993  ", -34.9061, -56.1993],
    ["40.4168, -3.7038", 40.4168, -3.7038],
    ["+40.4168 +3.7038", 40.4168, 3.7038],
    ["−34.9, −56.16", -34.9, -56.16], // unicode minus
  ])("%s", (input, lat, lng) => {
    const r = at(input);
    expect(r).toMatchObject({ lat, lng, kind: "decimal" });
  });

  it("accepts a decimal comma when the pair is separated by a space or a semicolon", () => {
    expect(at("-34,9061 -56,1993")).toMatchObject({ lat: -34.9061, lng: -56.1993 });
    expect(at("-34,9061; -56,1993")).toMatchObject({ lat: -34.9061, lng: -56.1993 });
    expect(at("-34,9061, -56,1993")).toMatchObject({ lat: -34.9061, lng: -56.1993 });
  });

  it("reads integer pairs", () => {
    expect(at("34, 56")).toMatchObject({ lat: 34, lng: 56 });
  });

  it("applies hemisphere letters after the numbers", () => {
    expect(at("34.9 S, 56.16 W")).toMatchObject({ lat: -34.9, lng: -56.16 });
    expect(at("34.9°S 56.16°W")).toMatchObject({ lat: -34.9, lng: -56.16 });
    expect(at("34.9S,56.16W")).toMatchObject({ lat: -34.9, lng: -56.16 });
    expect(at("40.4 N 3.7 E")).toMatchObject({ lat: 40.4, lng: 3.7 });
  });

  it("applies hemisphere letters before the numbers and Spanish O for oeste", () => {
    expect(at("S 34.9 W 56.16")).toMatchObject({ lat: -34.9, lng: -56.16 });
    expect(at("S34.9, O56.16")).toMatchObject({ lat: -34.9, lng: -56.16 });
  });

  it("swaps when the letters put longitude first", () => {
    expect(at("56.16 W, 34.9 S")).toMatchObject({ lat: -34.9, lng: -56.16 });
  });

  it("rounds to 6 decimals", () => {
    const r = at("-34.123456789, -56.987654321");
    expect(r).toMatchObject({ lat: -34.123457, lng: -56.987654 });
  });
});

describe("degrees, minutes, seconds", () => {
  it("parses DMS with hemisphere letters", () => {
    const r = at('34°54\'21.6"S 56°9\'41.5"W');
    expect(r.kind).toBe("dms");
    expect(r.lat).toBeCloseTo(-34.906, 3);
    expect(r.lng).toBeCloseTo(-56.161528, 5);
  });

  it("parses decimal minutes and typographic marks", () => {
    const r = at("34°54.36′S, 56°9.69′W");
    expect(r.lat).toBeCloseTo(-34.906, 4);
    expect(r.lng).toBeCloseTo(-56.1615, 4);
  });

  it("parses hemisphere letters in front and degrees only", () => {
    expect(at("N 40° E 3°")).toMatchObject({ lat: 40, lng: 3 });
  });

  it("rejects minutes or seconds of 60 or more", () => {
    expect(parseLocationText("34°61'S 56°9'W")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("Google Maps links", () => {
  it("reads @lat,lng,zoom from a place link", () => {
    const r = at("https://www.google.com/maps/place/Plaza+Independencia/@-34.9059,-56.1993,17z/data=!4m6");
    expect(r).toMatchObject({ lat: -34.9059, lng: -56.1993, kind: "google", zoom: 17 });
  });

  it("prefers the pin (!3d!4d) of a place link over the map centre", () => {
    const r = at("https://www.google.com/maps/place/Foo/@-34.9,-56.1,17z/data=!3m1!4b1!4m6!3m5!8m2!3d-34.9059!4d-56.1993");
    expect(r).toMatchObject({ lat: -34.9059, lng: -56.1993 });
  });

  it("reads ?q=lat,lng and ?query=", () => {
    expect(at("https://maps.google.com/?q=-34.9,-56.16")).toMatchObject({ lat: -34.9, lng: -56.16 });
    expect(at("https://www.google.com/maps/search/?api=1&query=-34.9%2C-56.16")).toMatchObject({ lat: -34.9, lng: -56.16 });
    expect(at("https://maps.google.com/?q=loc:-34.9,-56.16&z=15")).toMatchObject({ lat: -34.9, lng: -56.16, zoom: 15 });
  });

  it("reads ?ll=", () => {
    expect(at("https://maps.google.com/maps?ll=-34.9,-56.16&z=12")).toMatchObject({ lat: -34.9, lng: -56.16, zoom: 12 });
  });

  it("accepts a link without the scheme", () => {
    expect(at("google.com/maps/@-34.9,-56.16,15z")).toMatchObject({ lat: -34.9, lng: -56.16, zoom: 15 });
  });

  it("asks for the long link when it is shortened", () => {
    expect(parseLocationText("https://maps.app.goo.gl/AbCdEf123")).toEqual({ ok: false, reason: "short_link" });
    expect(parseLocationText("https://goo.gl/maps/AbCdEf123")).toEqual({ ok: false, reason: "short_link" });
  });

  it("fails on a place name without coordinates", () => {
    expect(parseLocationText("https://www.google.com/maps?q=Plaza+Independencia")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("Apple Maps, OpenStreetMap and geo: links", () => {
  it("reads Apple ll=", () => {
    expect(at("https://maps.apple.com/?ll=-34.9061,-56.1993&q=Sticker")).toMatchObject({ lat: -34.9061, lng: -56.1993, kind: "apple" });
    expect(at("https://maps.apple.com/?address=X&coordinate=-34.9061%2C-56.1993")).toMatchObject({ lat: -34.9061, lng: -56.1993 });
  });

  it("reads OpenStreetMap fragments and markers", () => {
    expect(at("https://www.openstreetmap.org/#map=17/-34.9061/-56.1993")).toMatchObject({ lat: -34.9061, lng: -56.1993, zoom: 17 });
    expect(at("https://www.openstreetmap.org/?mlat=-34.9061&mlon=-56.1993#map=16/-34.9/-56.1")).toMatchObject({ lat: -34.9061, lng: -56.1993 });
  });

  it("reads geo: URIs", () => {
    expect(at("geo:-34.9061,-56.1993?z=16")).toMatchObject({ lat: -34.9061, lng: -56.1993, zoom: 16, kind: "geo" });
  });
});

describe("rejections", () => {
  it("rejects empty text", () => {
    expect(parseLocationText("")).toEqual({ ok: false, reason: "empty" });
    expect(parseLocationText("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects out-of-range values instead of clamping them", () => {
    expect(parseLocationText("91, 10")).toEqual({ ok: false, reason: "out_of_range" });
    expect(parseLocationText("-91.5, 10")).toEqual({ ok: false, reason: "out_of_range" });
    expect(parseLocationText("10, 181")).toEqual({ ok: false, reason: "out_of_range" });
    expect(parseLocationText("10, -180.5")).toEqual({ ok: false, reason: "out_of_range" });
    expect(parseLocationText("https://www.google.com/maps/@95.0,10.0,5z")).toEqual({ ok: false, reason: "out_of_range" });
  });

  it("accepts the exact limits", () => {
    expect(at("90, 180")).toMatchObject({ lat: 90, lng: 180 });
    expect(at("-90, -180")).toMatchObject({ lat: -90, lng: -180 });
  });

  it("rejects 0,0 (null island)", () => {
    expect(parseLocationText("0, 0")).toEqual({ ok: false, reason: "out_of_range" });
  });

  it("rejects text that is not a location", () => {
    for (const text of ["hola", "abc, def", "34.9", "34.9 56.16 12.4", "https://example.com/foo"]) {
      expect(parseLocationText(text)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("parseCoordinates does not read links", () => {
    expect(parseCoordinates("https://maps.google.com/?q=-34.9,-56.16")).toEqual({ ok: false, reason: "invalid" });
  });
});
