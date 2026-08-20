-- CreateTable
CREATE TABLE "call_notes" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "call_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "call_notes_org_id_call_id_created_at_idx" ON "call_notes"("org_id", "call_id", "created_at");

-- AddForeignKey
ALTER TABLE "call_notes" ADD CONSTRAINT "call_notes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_notes" ADD CONSTRAINT "call_notes_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "telephony_calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_notes" ADD CONSTRAINT "call_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
