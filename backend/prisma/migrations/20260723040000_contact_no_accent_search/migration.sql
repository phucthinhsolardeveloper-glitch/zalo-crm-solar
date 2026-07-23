-- Tìm kiếm khách hàng không cần gõ dấu tiếng Việt (2026-07-23).
-- Thêm 2 cột bỏ dấu + lowercase của full_name/crm_name, backfill dữ liệu cũ bằng
-- translate() (không dùng extension `unaccent` — tránh phụ thuộc quyền superuser
-- trên môi trường Postgres managed). Map ký tự đã verify khớp 100% với hàm JS
-- stripVietnameseDiacritics() (backend/src/shared/utils/text-normalize.ts) trên
-- nhiều mẫu tên thật — xem cách sinh + test trong lịch sử session (node -e ...).
-- Idempotent với IF NOT EXISTS.

ALTER TABLE "contacts"
  ADD COLUMN IF NOT EXISTS "full_name_no_accent" TEXT,
  ADD COLUMN IF NOT EXISTS "crm_name_no_accent" TEXT;

UPDATE "contacts" SET
  "full_name_no_accent" = CASE WHEN "full_name" IS NULL THEN NULL ELSE translate(
    lower("full_name"),
    'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  ) END,
  "crm_name_no_accent" = CASE WHEN "crm_name" IS NULL THEN NULL ELSE translate(
    lower("crm_name"),
    'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  ) END
WHERE "full_name" IS NOT NULL OR "crm_name" IS NOT NULL;
