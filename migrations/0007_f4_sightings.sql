-- F4 (BUILD.md §19): "¿Sigue vivo?". A sighting = someone checks on a spot later; the spot keeps its derived life status.
CREATE TABLE sightings (
  id TEXT PRIMARY KEY,                           -- ULID
  spot_id TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('alive','damaged','covered','removed','moved')),
  lat REAL, lng REAL, location_source TEXT, location_accuracy_m REAL,
  distance_m REAL,                               -- from the spot's position when the sighting was made
  verified INTEGER NOT NULL DEFAULT 0,           -- device within 300 m, or a fresh photo
  via TEXT NOT NULL DEFAULT 'app' CHECK (via IN ('app','qr','radar','admin')),  -- 'qr' stays unused until v3 (§20)
  photo_key TEXT, thumb_key TEXT, video_key TEXT, video_poster_key TEXT,
  video_duration_ms INTEGER, video_w INTEGER, video_h INTEGER,
  reporter_person_id INTEGER REFERENCES people(id), reporter_raw TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  status_review TEXT NOT NULL DEFAULT 'auto' CHECK (status_review IN ('auto','pending','approved','rejected')),
  submitter_ip_hash TEXT, edit_token_hash TEXT
);
CREATE INDEX idx_sightings_spot ON sightings(spot_id, created_at);
CREATE INDEX idx_sightings_review ON sightings(status_review, created_at);

ALTER TABLE spots ADD COLUMN life_status TEXT NOT NULL DEFAULT 'alive' CHECK (life_status IN ('alive','unknown','dead'));
ALTER TABLE spots ADD COLUMN last_seen_at TEXT;
ALTER TABLE spots ADD COLUMN died_at TEXT;
ALTER TABLE spots ADD COLUMN sightings_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_spots_latlng ON spots(lat, lng);

-- Legacy spots: alive when younger than 12 months at migration, otherwise "sin noticias".
UPDATE spots SET life_status = 'unknown' WHERE COALESCE(taken_at, created_at) < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-12 months');
