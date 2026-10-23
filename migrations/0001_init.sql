-- Mapa Papin schema (BUILD.md §5)
PRAGMA foreign_keys = ON;

-- Sticker catalog (data-driven; admin can add rows)
CREATE TABLE sticker_types (
  slug         TEXT PRIMARY KEY,               -- 'papa', 'sexo-punto', 'sexo-pregunta', 'sexo-pregunta-og', 'otro'
  label        TEXT NOT NULL,                  -- 'Papa', 'Sexo.', 'Sexo?', 'Sexo? OG', 'Otro'
  legacy_code  TEXT UNIQUE,                    -- ArcGIS code: 'Papa','Sexo.','Sexo?','Sexo? OG','other'
  icon_key     TEXT NOT NULL,                  -- R2 key, e.g. 'icons/papa.png'
  color        TEXT NOT NULL DEFAULT '#31872E',-- cluster/legend accent
  icon_size    REAL NOT NULL DEFAULT 0.25,     -- MapLibre icon-size multiplier (only if the symbol-layer fallback is used)
  fit          TEXT NOT NULL DEFAULT 'contain' CHECK (fit IN ('cover','contain')), -- how the icon sits in its die-cut circle (design system)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,     -- hide from form without deleting
  allows_text  INTEGER NOT NULL DEFAULT 0,     -- 1 for 'otro' (free text)
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- People (shared by both roles: reporter "Soy:" and placer "¿Quién lo pegó?"), with alias merging
CREATE TABLE people (
  id           INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE people_aliases (
  alias        TEXT PRIMARY KEY COLLATE NOCASE,  -- raw trimmed value as typed
  person_id    INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE
);

-- A spot = one photo/place where ≥1 sticker types were seen
CREATE TABLE spots (
  id                TEXT PRIMARY KEY,           -- ULID (sortable)
  lat               REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng               REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  location_source   TEXT NOT NULL CHECK (location_source IN ('exif','device','pin','search','paste','legacy')),
  location_accuracy_m REAL,                     -- from Geolocation API, null otherwise
  is_approximate    INTEGER NOT NULL DEFAULT 0, -- user chose "approximate" (rounded ~100 m)
  place_name        TEXT,                       -- reverse geocode display, e.g. 'Bariloche, Río Negro'
  city              TEXT,
  country           TEXT,
  country_code      TEXT,                       -- ISO-3166 alpha-2, lowercase
  reporter_person_id INTEGER REFERENCES people(id), -- "Soy:" = who uploaded/reported it
  reporter_raw      TEXT,                       -- exactly what was typed
  placer_status     TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (placer_status IN ('self','other','unknown')),
                                                -- self = reporter stuck it; other = see spot_placers; unknown = "No sé"
  placer_note       TEXT,                       -- optional context, e.g. "lo vio el hermano de JM" (≤ 140)
  note              TEXT,                       -- optional short caption (≤ 280)
  other_text        TEXT,                       -- free text when type 'otro'
  photo_key         TEXT,                       -- 'display/<id>.webp' (EXIF-stripped, ≤1600px)
  thumb_key         TEXT,                       -- 'thumb/<id>.webp' (≤400px)
  orig_key          TEXT,                       -- 'orig/<id>.<ext>' (private, never served publicly)
  photo_w INTEGER, photo_h INTEGER,
  photo_sha256      TEXT,                       -- of the original bytes (dedupe)
  taken_at          TEXT,                       -- EXIF DateTimeOriginal if present
  created_at        TEXT NOT NULL,              -- ISO UTC
  updated_at        TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','pending','hidden')),
  needs_review      INTEGER NOT NULL DEFAULT 0,
  review_reason     TEXT,
  edit_token_hash   TEXT,                       -- SHA-256 of a secret given to the submitter (edit/delete own spot for 24 h)
  batch_id          TEXT REFERENCES batches(id),-- set when created through bulk add (§7.3b); null for single adds
  client_ref        TEXT,                       -- client id of the photo inside its batch (idempotent retries)
  submitter_ip_hash TEXT,                       -- HMAC(ip, secret), for rate limiting/abuse only
  -- legacy provenance
  legacy_objectids  TEXT,                       -- JSON array, e.g. '[91,92]' after merge
  legacy_globalids  TEXT,                       -- JSON array
  legacy_creator    TEXT,
  legacy_filename   TEXT,
  legacy_attachment_ids TEXT                    -- JSON array
);
CREATE INDEX idx_spots_status_updated ON spots(status, updated_at);
CREATE INDEX idx_spots_reporter ON spots(reporter_person_id);
CREATE INDEX idx_spots_country ON spots(country_code);
CREATE UNIQUE INDEX idx_spots_sha ON spots(photo_sha256) WHERE photo_sha256 IS NOT NULL;

-- many-to-many: which sticker types appear in a spot
CREATE TABLE spot_types (
  spot_id   TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  type_slug TEXT NOT NULL REFERENCES sticker_types(slug),
  PRIMARY KEY (spot_id, type_slug)
);
CREATE INDEX idx_spot_types_type ON spot_types(type_slug);

-- who stuck the sticker(s): 0..n people per spot (groups often stick together)
-- placer_status='self'    → exactly one row = reporter_person_id
-- placer_status='other'   → ≥1 rows, any people
-- placer_status='unknown' → 0 rows
CREATE TABLE spot_placers (
  spot_id   TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id),
  PRIMARY KEY (spot_id, person_id)
);
CREATE INDEX idx_spot_placers_person ON spot_placers(person_id);

-- simple settings (e.g. moderation mode)
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings VALUES ('moderation_mode','open');   -- 'open' | 'approval'
INSERT INTO settings VALUES ('default_lang','es');         -- 'es' | 'en'
INSERT INTO settings VALUES ('map_style_url','https://tiles.openfreemap.org/styles/liberty'); -- swap tile provider without a deploy (§4.1)
INSERT INTO settings VALUES ('r2_bytes','0');              -- storage meter, updated on every R2 write/delete (§4.1)
-- Phase 10 feature flags (Ajustes → "Funciones (Fase 2)", §19): 'off' | 'admin' | 'on'
INSERT INTO settings VALUES ('feature_video','off'),('feature_instagram','off'),
                            ('feature_sightings','off'),('feature_globe_wrapped','off');   -- no QR flag: F3 is paused (v3, §20)

-- audit trail for admin + submitter edits
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor TEXT NOT NULL,              -- 'admin:<email>' | 'submitter' | 'migration'
  action TEXT NOT NULL,             -- 'create','update','hide','delete','merge_people','add_type',…
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  diff_json TEXT
);

-- rate limiting
CREATE TABLE submissions_rl (ip_hash TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'single'); -- 'single' | 'batch' | 'batch_spot'
CREATE INDEX idx_rl ON submissions_rl(ip_hash, kind, at);

-- Bulk add (§7.3b): one row per upload session of many photos
CREATE TABLE batches (
  id                 TEXT PRIMARY KEY,          -- ULID
  reporter_person_id INTEGER REFERENCES people(id),
  max_spots          INTEGER NOT NULL DEFAULT 100,
  created_count      INTEGER NOT NULL DEFAULT 0,
  edit_token_hash    TEXT NOT NULL,             -- edit/delete any spot of the batch, or the whole batch, for 24 h
  submitter_ip_hash  TEXT,
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL              -- batch token validity (2 h)
);
CREATE UNIQUE INDEX idx_spots_batch_ref ON spots(batch_id, client_ref) WHERE batch_id IS NOT NULL;

-- Reverse-geocode cache (coords rounded to 3 decimals), filled by the cron trigger
CREATE TABLE geocode_cache (
  key TEXT PRIMARY KEY,                         -- 'lat3,lng3'
  place_name TEXT, city TEXT, country TEXT, country_code TEXT,
  fetched_at TEXT NOT NULL
);
