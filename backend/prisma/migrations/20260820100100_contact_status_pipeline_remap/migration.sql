-- 2026-08-20: frontend STATUS_OPTIONS replaced the old 5-stage generic placeholder
-- ('new'/'contacted'/'interested'/'converted'/'lost') with the company's real 10-stage
-- sales pipeline. 'new'/'contacted'/'interested' keep the same slugs (no-op below).
-- Remap the two removed slugs to their closest real-pipeline equivalent so existing
-- data isn't silently orphaned from an unrecognized dropdown value.
UPDATE "contacts" SET "status" = 'purchased' WHERE "status" = 'converted';
UPDATE "contacts" SET "status" = 'not_potential' WHERE "status" = 'lost';
