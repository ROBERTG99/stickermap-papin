import { describe, expect, it } from "vitest";
import { crc32, zipStored } from "../../src/lib/zip";

describe("zipStored", () => {
  it("has the standard CRC-32 of a known string", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes entries a ZIP reader can find: signatures, names, sizes and the end record", () => {
    const a = new TextEncoder().encode("hola");
    const b = new TextEncoder().encode("papin");
    const zip = zipStored([{ name: "uno.txt", data: a }, { name: "dos.txt", data: b }], new Date(2026, 11, 1, 10, 0, 0));
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const text = new TextDecoder("latin1").decode(zip);
    expect(text).toContain("uno.txt");
    expect(text).toContain("dos.txt");
    expect(text).toContain("hola");
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    // the central directory starts where the end record says and begins with its signature
    expect(view.getUint32(view.getUint32(end + 16, true), true)).toBe(0x02014b50);
  });
});
