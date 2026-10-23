-- A hidden or deleted spot no longer reserves its photo hash: re-uploading a photo after "Borrar este lote" must work.
DROP INDEX idx_spots_sha;
CREATE UNIQUE INDEX idx_spots_sha ON spots(photo_sha256) WHERE photo_sha256 IS NOT NULL AND status != 'hidden';
