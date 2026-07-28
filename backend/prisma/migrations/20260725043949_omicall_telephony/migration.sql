-- DropIndex
DROP INDEX "contacts_pool_robin_idx";

-- DropIndex
DROP INDEX "zalo_accounts_org_id_archived_at_idx";

-- AlterTable
ALTER TABLE "automation_triggers" ALTER COLUMN "welcome_delay_seconds" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "lead_notify_acks" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "telephony_calls" ADD COLUMN     "contact_id" TEXT,
ADD COLUMN     "external_number" TEXT,
ALTER COLUMN "peer_user_id" DROP NOT NULL,
ALTER COLUMN "provider" SET DEFAULT 'omicall';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "omicall_extension" TEXT,
ADD COLUMN     "omicall_extension_secret" TEXT;

-- CreateIndex
CREATE INDEX "contacts_org_id_pooled_count_last_pooled_at_idx" ON "contacts"("org_id", "pooled_count", "last_pooled_at");

-- CreateIndex
CREATE INDEX "telephony_calls_org_id_external_number_started_at_idx" ON "telephony_calls"("org_id", "external_number", "started_at" DESC);

-- CreateIndex
CREATE INDEX "telephony_calls_contact_id_started_at_idx" ON "telephony_calls"("contact_id", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "telephony_calls" ADD CONSTRAINT "telephony_calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_zalo_account_id_fkey" FOREIGN KEY ("source_zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "lead_pool_distributions_org_id_assigned_to_user_id_distributed_" RENAME TO "lead_pool_distributions_org_id_assigned_to_user_id_distribu_idx";
