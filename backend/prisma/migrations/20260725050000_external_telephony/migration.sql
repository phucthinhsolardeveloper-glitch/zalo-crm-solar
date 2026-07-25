ALTER TABLE "telephony_calls" ALTER COLUMN "peer_user_id" DROP NOT NULL;
ALTER TABLE "telephony_calls" ADD COLUMN "contact_id" TEXT;
ALTER TABLE "telephony_calls" ADD COLUMN "external_number" TEXT;

CREATE INDEX "telephony_calls_org_id_external_number_started_at_idx"
  ON "telephony_calls"("org_id", "external_number", "started_at" DESC);
CREATE INDEX "telephony_calls_contact_id_started_at_idx"
  ON "telephony_calls"("contact_id", "started_at" DESC);

ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
