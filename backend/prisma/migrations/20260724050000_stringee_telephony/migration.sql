-- Replace the old Zalo-message/manual-upload prototype with real Stringee WebRTC history.
DROP TABLE IF EXISTS "call_records";

CREATE TABLE "telephony_calls" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "peer_user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'stringee',
  "provider_call_id" TEXT,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'initiated',
  "from_identity" TEXT NOT NULL,
  "to_identity" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answered_at" TIMESTAMP(3),
  "ended_at" TIMESTAMP(3),
  "duration_sec" INTEGER,
  "end_reason" TEXT,
  "recording_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telephony_calls_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telephony_calls_owner_user_id_provider_call_id_key"
  ON "telephony_calls"("owner_user_id", "provider_call_id");
CREATE INDEX "telephony_calls_org_id_owner_user_id_started_at_idx"
  ON "telephony_calls"("org_id", "owner_user_id", "started_at" DESC);
CREATE INDEX "telephony_calls_org_id_peer_user_id_started_at_idx"
  ON "telephony_calls"("org_id", "peer_user_id", "started_at" DESC);

ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_peer_user_id_fkey"
  FOREIGN KEY ("peer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
