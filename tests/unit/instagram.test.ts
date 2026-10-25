import { describe, expect, it } from "vitest";
import { normalizeHandle, normalizePostUrl, postKind, profileUrl } from "../../src/shared/instagram";

describe("normalizeHandle", () => {
  it("strips @, trims and lowercases", () => {
    expect(normalizeHandle(" @Chimbo.Papin ")).toBe("chimbo.papin");
    expect(normalizeHandle("papa_01")).toBe("papa_01");
  });
  it("rejects what Instagram does not allow", () => {
    for (const bad of ["no..good", "ends.", "has space", "with-dash", "a".repeat(31), "ñandú", "@@"]) expect(normalizeHandle(bad)).toBeNull();
  });
  it("blank is no handle", () => {
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
    expect(normalizeHandle(undefined)).toBeNull();
  });
});

describe("normalizePostUrl", () => {
  it("accepts posts, reels and tv with or without protocol and strips the query", () => {
    expect(normalizePostUrl("https://www.instagram.com/reel/C8xQ2p/?igsh=abc")).toBe("https://www.instagram.com/reel/C8xQ2p/");
    expect(normalizePostUrl("instagram.com/p/AbC_-12")).toBe("https://www.instagram.com/p/AbC_-12/");
    expect(normalizePostUrl("http://instagram.com/tv/XyZ#x")).toBe("https://www.instagram.com/tv/XyZ/");
  });
  it("rejects other hosts and other paths", () => {
    expect(normalizePostUrl("https://example.com/p/abc")).toBeNull();
    expect(normalizePostUrl("https://instagram.com/chimbo.papin")).toBeNull();
    expect(normalizePostUrl("https://instagram.com.evil.test/p/abc")).toBeNull();
    expect(normalizePostUrl("")).toBeNull();
  });
  it("tells a reel from a post", () => {
    expect(postKind("https://www.instagram.com/reel/a/")).toBe("reel");
    expect(postKind("https://www.instagram.com/p/a/")).toBe("post");
    expect(profileUrl("chimbo.papin")).toBe("https://instagram.com/chimbo.papin");
  });
});
