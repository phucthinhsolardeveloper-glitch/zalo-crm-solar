-- Raise only the legacy normal-chat defaults. Broadcast remains in the separate
-- campaign_message category and is intentionally not changed here.

UPDATE "sdk_limits"
SET "daily_limit" = 5000,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "category" = 'message'
  AND "zalo_account_id" IS NULL
  AND "daily_limit" IN (200, 300);

UPDATE "zalo_accounts"
SET "daily_message_cap" = 5000
WHERE "daily_message_cap" IN (200, 300);
