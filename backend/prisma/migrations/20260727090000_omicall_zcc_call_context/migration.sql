-- Add ZCC/PSTN channel context without changing existing Omicall call rows.
ALTER TABLE "telephony_calls"
  ADD COLUMN "conversation_id" TEXT,
  ADD COLUMN "external_identity" TEXT,
  ADD COLUMN "external_identity_type" TEXT,
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'pstn';

CREATE INDEX "telephony_calls_conversation_id_started_at_idx"
  ON "telephony_calls"("conversation_id", "started_at" DESC);

ALTER TABLE "telephony_calls"
  ADD CONSTRAINT "telephony_calls_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
