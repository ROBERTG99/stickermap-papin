-- F2 (BUILD.md §19): a person's optional Instagram handle and a spot's optional post/reel link. Plain data that links out: no Instagram API.
ALTER TABLE people ADD COLUMN instagram_handle TEXT;   -- lowercase, no '@'
CREATE UNIQUE INDEX idx_people_ig ON people(instagram_handle) WHERE instagram_handle IS NOT NULL;
ALTER TABLE spots ADD COLUMN instagram_post_url TEXT;
