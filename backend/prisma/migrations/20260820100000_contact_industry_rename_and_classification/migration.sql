-- Rename Occupation -> Industry across the app (2026-08-20 audit).
-- RENAME COLUMN preserves existing data (not a drop+recreate).
ALTER TABLE "contacts" RENAME COLUMN "occupation" TO "industry";

-- New optional classification fields (safe additive columns, no data loss risk).
ALTER TABLE "contacts" ADD COLUMN "store_name" TEXT;
ALTER TABLE "contacts" ADD COLUMN "customer_type" TEXT;
