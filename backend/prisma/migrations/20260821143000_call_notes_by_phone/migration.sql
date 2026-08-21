-- Call notes follow the normalized external phone number while retaining call_id
-- as the immutable audit link to the call after which the note was entered.
ALTER TABLE "call_notes" ADD COLUMN "phone_key" TEXT;

UPDATE "call_notes" AS n
SET "phone_key" = CASE
  WHEN d.digits ~ '^0[0-9]{9,10}$' THEN '84' || substring(d.digits FROM 2)
  WHEN d.digits ~ '^84[0-9]{9,10}$' THEN d.digits
  WHEN d.digits ~ '^[0-9]{9}$' THEN '84' || d.digits
  WHEN length(d.digits) BETWEEN 9 AND 13 THEN d.digits
  ELSE NULL
END
FROM "telephony_calls" AS c
CROSS JOIN LATERAL (
  SELECT regexp_replace(COALESCE(c."external_number", ''), '[^0-9]', '', 'g') AS digits
) AS d
WHERE n."call_id" = c."id"
  AND c."channel" <> 'internal';

CREATE INDEX "call_notes_org_id_phone_key_created_at_idx"
  ON "call_notes"("org_id", "phone_key", "created_at" DESC);
