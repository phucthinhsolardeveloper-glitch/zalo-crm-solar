# Handoff — Mục E: chuyển địa chỉ Contact sang mô hình 2 cấp

Ngày: 2026-09-30. User chốt quyết định: dùng 2 cấp (tỉnh + xã) khớp
`crm-custom`, bỏ `district`, và "chuẩn hoá hết" (dùng danh sách tỉnh/xã chính
thức thay vì text tự do/tự học). Plan đầy đủ: `/home/admin01/.claude/plans/generic-bouncing-thimble.md`.

## DONE

- **Backend proxy address-kit:** `backend/src/shared/address-kit-client.ts`
  (fetch + cache in-memory + `resolveProvinceCode`/`resolveWardCode`) và
  `backend/src/modules/contacts/address-kit-routes.ts`
  (`GET /api/v1/address/provinces`, `GET /api/v1/address/provinces/:code/wards`,
  cache header 1 năm). Upstream: `production.cas.so/address-kit/latest` (cùng
  nguồn `crm-custom` đã dùng) — đã verify thật bằng curl trước khi build lên
  trên.
- **Schema:** `Contact` thêm `addressProvinceCode/Name`, `addressWardCode/Name`,
  `addressStreet` (migration `20260930142600_contact_address_2tier`, áp dụng
  trực tiếp qua psql + `prisma migrate resolve --applied`, backup DB trước khi
  chạy: `backups/manual/backup-zalocrm-pre-address-2tier-migration-2026-09-30-1425.sql.gz`).
  Cột legacy (`province/district/ward/addressLine`) GIỮ NGUYÊN, không xoá,
  comment "LEGACY — không ghi mới".
- **Write path đổi sang field mới** (ngừng ghi field cũ):
  `contact-routes.ts` (3 chỗ: tạo hồ sơ đầy đủ, quick-add, update),
  `contact-import-service.ts` (import hàng loạt — tái dùng nguyên
  `resolveAddressMigration` đã có từ trước cho case địa chỉ cũ 3 cấp),
  `contact-export-routes.ts` (export — field mới ưu tiên, fallback legacy cho
  contact chưa backfill, giữ nguyên tên cột export để không vỡ round-trip
  import↔export).
- **Frontend:** component dùng chung `ProvinceWardPicker.vue` (2 dropdown phụ
  thuộc tỉnh→xã) + `composables/use-address-kit.ts` (cache localStorage 1 năm,
  port từ `crm-custom/apps/web/src/lib/address-kit.ts`). Áp dụng vào
  `CustomerProfileDialog.vue`, `AddCustomerQuickDialog.vue`,
  `ContactDetailDialog.vue` (3 form tạo/sửa chính — cả 3 đều dùng chung). Sửa
  hiển thị (không cần picker) ở `ContactDetailPanel.vue`, `ContactsView.vue`.
  Dọn code chết: xoá hẳn cơ chế gợi ý tự học cũ (`addressSuggestions`,
  `wardSuggestions`, `loadAddressSuggestions`, import `wardsForProvince`) ở cả
  3 dialog trên — không còn ai gọi `GET /contacts/address-suggestions` từ các
  form chính nữa (endpoint đó vẫn còn trong `contact-routes.ts`, chưa xoá, xem
  REMAINING).
- **Backfill dữ liệu cũ:** `backend/scripts/backfill-contact-address-2tier.ts`
  (dry-run mặc định, `--apply` mới ghi, ghi review JSON cho case không khớp).
  Đã chạy thật: `total=6 resolved=5 review=1 → applied=5`. 1 contact
  (Gia Lai/Hội Phú/Trà Bá) không khớp bảng CSV sáp nhập → nằm trong file review
  (đã lưu ở scratchpad phiên này, không phải vị trí lâu dài — cần user tự
  kiểm tra lại địa chỉ contact đó bằng tay nếu cần).

## VERIFIED

- Backend: `69 files / 500 tests` pass, `tsc --noEmit` sạch (sau toàn bộ thay
  đổi, chạy nhiều lần trong lúc code).
- Frontend: `vue-tsc --noEmit` sạch VÀ `npm run build` (chế độ `-b` project
  reference) pass — lưu ý: `--noEmit` đơn lẻ đã không bắt được 1 biến chết còn
  sót (`loadAddressSuggestions` gọi ở `AddCustomerQuickDialog.vue`), chỉ
  `npm run build` mới bắt ra — dùng `npm run build` làm nguồn xác nhận cuối,
  không chỉ `vue-tsc --noEmit`.
- Upstream address-kit API: verify bằng `curl` thật trước khi build code lên
  trên (tránh giả định sai schema response).
- DB thật sau backfill: `SELECT ... WHERE address_province_code IS NOT NULL`
  ra đúng 5 contact với code/tên đúng như log script in ra.
- App vẫn `/health` = 200, backend test suite pass sau khi áp schema migration
  vào DB đang chạy thật (không downtime, chỉ ADD COLUMN).

## REMAINING

- **`ContactImportDialog.vue` không đổi** — cố ý: field `province/district/ward`
  ở đây là tên CỘT SPREADSHEET import (khác field DB Contact), giữ nguyên tên
  để không vỡ logic đoán cột hiện có. Import vẫn hoạt động đúng vì
  `contact-import-service.ts` (nơi ghi DB) đã đổi sang field mới.
- **Endpoint `GET /contacts/address-suggestions` chưa xoá** — không còn form
  chính nào gọi, nhưng chưa dọn hẳn (an toàn, không ai gọi thì không hại gì).
  Có thể xoá ở đợt dọn dẹp sau khi chắc chắn không còn chỗ nào dùng.
- **1 contact còn trong diện review** (Gia Lai/Hội Phú/Trà Bá, `csv_not_found`)
  — chưa có `addressProvinceCode`, vẫn hiện theo field legacy (fallback tự
  động ở mọi nơi hiển thị, không bị "mất" dữ liệu, chỉ chưa chuẩn hoá).
- **AddressAutocomplete.vue vẫn còn dùng** cho use-case KHÁC (industry, source
  — gợi ý tự do chung chung), không đụng tới, đúng theo plan.
- **Không xoá cột legacy** — cố ý, để sau khi chạy ổn định 1 thời gian.

## RELEVANT FILES

Backend: `address-kit-client.ts` (mới), `address-kit-routes.ts` (mới),
`backfill-contact-address-2tier.ts` (mới), `contact-routes.ts`,
`contact-import-service.ts`, `contact-export-routes.ts`, `schema.prisma`,
migration `20260930142600_contact_address_2tier`.

Frontend: `use-address-kit.ts` (mới), `ProvinceWardPicker.vue` (mới),
`CustomerProfileDialog.vue`, `AddCustomerQuickDialog.vue`,
`ContactDetailDialog.vue`, `ContactDetailPanel.vue`, `ContactsView.vue`,
`use-contacts.ts` (Contact interface).

## NEXT

1. User tự kiểm tra 1 contact còn review (Gia Lai) nếu cần chuẩn hoá luôn.
2. Cân nhắc dọn endpoint `address-suggestions` khi rảnh.
3. **C và I (kế hoạch riêng, chưa bắt đầu code):**
   - C: user xác nhận cho phép gửi hàng loạt từ nick cá nhân TRONG GIỚI HẠN.
     Đề xuất (do user giao quyền quyết): category quota mới `campaign_message`
     tách khỏi `message` 300/ngày, mặc định 50/ngày/nick — lý do đã ghi trong
     plan file. Chưa code, cần plan riêng (model Batch/Recipient, worker).
   - I: user xác nhận sẽ có Zalo OA nhưng CHƯA đăng ký/CHƯA có credential.
     Việc kỹ thuật: dựng khung module rỗng trả 501 trước, nối thật khi có OA
     ID + API key.
