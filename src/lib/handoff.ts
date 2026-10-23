/**
 * In-memory hand-off between screens. `/nuevo` picking 2+ photos sends them to `/nuevo/varias`, and the Android share
 * target (service worker -> /compartir) leaves its files here too. Files cannot travel through the URL.
 */
export const pendingFiles: { value: File[] } = { value: [] };

export function takePendingFiles(): File[] {
  const files = pendingFiles.value;
  pendingFiles.value = [];
  return files;
}
