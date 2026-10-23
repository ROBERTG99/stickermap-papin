import { adminApi, downloadFrom, fetchAllSpots, filterParams, saveBlob, type SpotFilters } from "./api";
import { exportGeoPackage } from "./gpkg";

export type ExportFormat = "csv" | "geojson" | "gpkg";

const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * Export what the active filters show. CSV and GeoJSON come from `/api/admin/export` with the same query string as the list;
 * the GeoPackage is built here, in the browser, from every filtered row (pages of 1000). Resolves with the file name and row count.
 */
export async function exportSpots(format: ExportFormat, filters: Partial<SpotFilters>, onProgress?: (loaded: number, total: number) => void): Promise<{ filename: string; rows: number | null }> {
  if (format !== "gpkg") {
    const params = filterParams(filters);
    params.set("format", format);
    const filename = await downloadFrom(`/api/admin/export?${params}`, `stickermap-${stamp()}.${format === "csv" ? "csv" : "geojson"}`);
    return { filename, rows: null };
  }
  const [spots, types] = await Promise.all([fetchAllSpots(filters, onProgress), adminApi.types()]);
  const blob = await exportGeoPackage(spots, types);
  const filename = `stickermap-${stamp()}.gpkg`;
  saveBlob(blob, filename);
  return { filename, rows: spots.length };
}
