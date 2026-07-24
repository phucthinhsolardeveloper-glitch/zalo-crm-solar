-- CallRecord (2026-07-23): 1 dòng / 1 cuộc gọi Zalo (thật hoặc log tay). Xem
-- docs/superpowers/specs/2026-07-23-zalo-call-log-recording-design.md.
CREATE TABLE "call_records" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "org_id"                TEXT NOT NULL,
  "contact_id"            TEXT NOT NULL,
  "friend_id"             TEXT,
  "zalo_account_id"       TEXT NOT NULL,
  "conversation_id"       TEXT,

  "direction"             TEXT NOT NULL,
  "call_type"             TEXT NOT NULL,
  "status"                TEXT NOT NULL,
  "duration_sec"          INTEGER,
  "occurred_at"           TIMESTAMP(3) NOT NULL,

  "source_message_id"     TEXT,

  "recording_key"         TEXT,
  "recording_url"         TEXT,
  "recording_mime_type"   TEXT,
  "recording_size_bytes"  INTEGER,

  "note"                  TEXT,
  "created_by_user_id"    TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "call_records_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "call_records_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "call_records_friend_id_fkey"
    FOREIGN KEY ("friend_id") REFERENCES "friends"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "call_records_zalo_account_id_fkey"
    FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "call_records_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "call_records_source_message_id_fkey"
    FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "call_records_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "call_records_org_id_contact_id_occurred_at_idx"
  ON "call_records"("org_id", "contact_id", "occurred_at" DESC);
CREATE INDEX "call_records_org_id_occurred_at_idx"
  ON "call_records"("org_id", "occurred_at" DESC);
CREATE UNIQUE INDEX "call_records_source_message_id_key"
  ON "call_records"("source_message_id");
