-- F1 (BUILD.md §19): a spot may carry a short video next to (or instead of) its photo. Converted to H.264 MP4 in the browser; stored in R2 as `video/<id>.mp4`.
ALTER TABLE spots ADD COLUMN video_key TEXT;                          -- 'video/<id>.mp4' (or .mov for the untranscoded fallback)
ALTER TABLE spots ADD COLUMN video_poster_key TEXT;                   -- 'display/<id>-poster.webp', or the spot's own photo_key when it has no photo
ALTER TABLE spots ADD COLUMN video_duration_ms INTEGER;
ALTER TABLE spots ADD COLUMN video_w INTEGER;
ALTER TABLE spots ADD COLUMN video_h INTEGER;
ALTER TABLE spots ADD COLUMN video_bytes INTEGER;
ALTER TABLE spots ADD COLUMN video_needs_transcode INTEGER NOT NULL DEFAULT 0;
