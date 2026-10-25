-- The person who uploaded a sticker is the one who stuck it (decided 2026-10-25): placers always mirror the reporter.
-- Spots without a reporter stay anonymous ('unknown', no placers).
DELETE FROM spot_placers;
INSERT INTO spot_placers (spot_id, person_id) SELECT id, reporter_person_id FROM spots WHERE reporter_person_id IS NOT NULL;
UPDATE spots SET placer_status = CASE WHEN reporter_person_id IS NOT NULL THEN 'self' ELSE 'unknown' END, placer_note = NULL;

-- "Sé quién lo pegó" reports and "placer note typed in Soy" flags no longer exist: drop those reasons.
UPDATE spots SET needs_review = 0
 WHERE review_reason IN ('know_placer', 'placer_note_in_soy', 'know_placer,placer_note_in_soy', 'placer_note_in_soy,know_placer');
UPDATE spots
   SET review_reason = NULLIF(trim(replace(replace(',' || review_reason || ',', ',know_placer,', ','), ',placer_note_in_soy,', ','), ','), '')
 WHERE review_reason LIKE '%know_placer%' OR review_reason LIKE '%placer_note_in_soy%';
