ALTER TABLE "ai_configs"
  ADD COLUMN "zalo_chatbot_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "zalo_chatbot_model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  ADD COLUMN "zalo_chatbot_prompt_template" TEXT,
  ADD COLUMN "zalo_chatbot_weekday_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "zalo_chatbot_weekday_start" TEXT NOT NULL DEFAULT '18:00',
  ADD COLUMN "zalo_chatbot_weekday_end" TEXT NOT NULL DEFAULT '08:00',
  ADD COLUMN "zalo_chatbot_weekend_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "zalo_chatbot_weekend_start" TEXT NOT NULL DEFAULT '00:00',
  ADD COLUMN "zalo_chatbot_weekend_end" TEXT NOT NULL DEFAULT '23:59',
  ADD COLUMN "zalo_chatbot_max_daily" INTEGER NOT NULL DEFAULT 200,
  ADD COLUMN "zalo_chatbot_similarity" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  ADD COLUMN "zalo_chatbot_top_k" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "zalo_chatbot_embedding_model" TEXT NOT NULL DEFAULT 'text-embedding-3-small';

CREATE TABLE "ai_knowledge_docs" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL DEFAULT 'text/plain',
  "size_bytes" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "error" TEXT,
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_knowledge_docs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_knowledge_docs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ai_knowledge_chunks" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "doc_id" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_knowledge_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_knowledge_chunks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_knowledge_chunks_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "ai_knowledge_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ai_chatbot_logs" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "trigger_message_id" TEXT,
  "reply_message_id" TEXT,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "question" TEXT,
  "answer" TEXT,
  "similarity" DOUBLE PRECISION,
  "source_doc_ids" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_chatbot_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_chatbot_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ai_knowledge_docs_org_id_status_created_at_idx" ON "ai_knowledge_docs"("org_id", "status", "created_at" DESC);
CREATE UNIQUE INDEX "ai_knowledge_chunks_doc_id_position_key" ON "ai_knowledge_chunks"("doc_id", "position");
CREATE INDEX "ai_knowledge_chunks_org_id_doc_id_idx" ON "ai_knowledge_chunks"("org_id", "doc_id");
CREATE INDEX "ai_chatbot_logs_org_id_status_created_at_idx" ON "ai_chatbot_logs"("org_id", "status", "created_at" DESC);
CREATE INDEX "ai_chatbot_logs_conversation_id_created_at_idx" ON "ai_chatbot_logs"("conversation_id", "created_at" DESC);
CREATE UNIQUE INDEX "ai_chatbot_logs_org_id_trigger_message_id_key" ON "ai_chatbot_logs"("org_id", "trigger_message_id");

ALTER TABLE "ai_knowledge_docs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_knowledge_docs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_knowledge_docs"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "ai_knowledge_chunks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_knowledge_chunks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_knowledge_chunks"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "ai_chatbot_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_chatbot_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ai_chatbot_logs"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');
