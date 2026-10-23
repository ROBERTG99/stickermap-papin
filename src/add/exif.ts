/**
 * EXIF reader for the add form. `readExif` in `src/lib/photo.ts` passes `pick: [...]` together with `gps: true`, which the
 * exifr lite build rejects ("undefined is not iterable"), so it always returns "no GPS, no date". Until that is fixed
 * there, this reader names the segments and tags explicitly, which works and still skips everything else in the file.
 */
import { parse as parseExif } from "exifr/dist/lite.esm.mjs";
import { exifDateToNaive, validGps, type PhotoExif } from "../lib/photo";

export async function readExifFixed(file: Blob): Promise<PhotoExif | null> {
  try {
    // The typings of exifr do not cover per-segment tag lists for the lite build, hence the cast.
    const options = {
      tiff: false, xmp: false, icc: false, iptc: false, jfif: false, ifd1: false, interop: false,
      exif: ["DateTimeOriginal"],
      gps: ["GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef", "GPSHPositioningError"],
      reviveValues: false,
      translateValues: false,
      mergeOutput: true,
    };
    const tags = (await parseExif(file, options as never)) as { latitude?: number; longitude?: number; GPSHPositioningError?: number; DateTimeOriginal?: unknown } | undefined;
    const ok = validGps(tags?.latitude, tags?.longitude);
    return {
      lat: ok ? tags!.latitude! : null,
      lng: ok ? tags!.longitude! : null,
      accuracyM: ok && typeof tags?.GPSHPositioningError === "number" ? tags.GPSHPositioningError : null,
      takenAt: exifDateToNaive(tags?.DateTimeOriginal),
    };
  } catch {
    return null;
  }
}
