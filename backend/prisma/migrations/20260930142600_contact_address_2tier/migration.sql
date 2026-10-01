-- Mục E: địa chỉ Contact chuyển sang mô hình 2 cấp (tỉnh + xã), khớp crm-custom.
-- Cột legacy (province/district/ward/address_line) GIỮ NGUYÊN, không xoá.
ALTER TABLE "contacts"
  ADD COLUMN "address_province_code" TEXT,
  ADD COLUMN "address_province_name" TEXT,
  ADD COLUMN "address_ward_code" TEXT,
  ADD COLUMN "address_ward_name" TEXT,
  ADD COLUMN "address_street" TEXT;

CREATE INDEX "contacts_org_id_address_province_code_idx"
  ON "contacts" ("org_id", "address_province_code");
