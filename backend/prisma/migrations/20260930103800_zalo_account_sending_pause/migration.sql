-- Tranche 2 kill switch: tạm dừng outbound theo nick mà không cần disconnect.
-- Cả 3 cột đều nullable, không có default bắt buộc → an toàn cho dữ liệu hiện có.
ALTER TABLE "zalo_accounts"
  ADD COLUMN "sending_paused_at" TIMESTAMP(3),
  ADD COLUMN "sending_paused_reason" TEXT,
  ADD COLUMN "sending_paused_by_id" TEXT;
