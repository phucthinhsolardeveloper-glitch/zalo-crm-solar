# Lộ trình triển khai — Cuộc họp 25/08/2026

Ngày lập: 2026-09-03. Nguồn: biên bản họp 25/08 + đọc code nhánh hiện tại.
Trạng thái: **KẾ HOẠCH — CHƯA CODE**. Chờ chốt từng mục theo cột "Cần trước khi làm".

Tài liệu kiến trúc phần gửi hàng loạt: `docs/13-handoffs/` không chứa — xem artifact "Kiến trúc gửi tin nhắn hàng loạt" đã trình sếp.

---

## Phân nhóm công việc

| ID | Hạng mục | Repo | Chính sách Zalo | Ước lượng | Trạng thái |
|----|----------|------|-----------------|-----------|------------|
| F | Hồ sơ KH: bắt buộc **tỉnh**, không bắt buộc **xã** | zalo-crm-solar | Không liên quan | S | Sẵn sàng |
| B | Nút tạo nhắc hẹn ngay trên trang khách hàng | zalo-crm-solar | Không liên quan | S | Sẵn sàng |
| G | Fix: KH có Zalo nhưng báo "chưa kết nối / chưa làm" | zalo-crm-solar | Không liên quan | S–M | Chờ xác nhận triệu chứng |
| H | Audit: 2 nick Zalo / 1 CRM — thấy & tương tác chồng chéo? | zalo-crm-solar | Cần đối chiếu chính sách | M (điều tra) | Sẵn sàng |
| D | Trạng thái Kết bạn/Chưa KB + nút "Kết bạn" ở màn cuộc gọi | zalo-crm-solar | Giới hạn kết bạn — giữ trần | M | Sẵn sàng |
| E | Import KH: ánh xạ địa chỉ cũ → mới sau sáp nhập | zalo-crm-solar | Không liên quan | M | Chờ dữ liệu ánh xạ |
| C | Queue chia lô gửi tin nhắn hàng loạt | zalo-crm-solar | **Rủi ro khoá nick** | L | **TẠM HOÃN — chờ sếp duyệt** |
| A | Gửi ảnh chung: chọn nhiều ảnh + gửi nhiều người | zalo-crm-solar | Rủi ro (đi qua C) | M | **TẠM HOÃN — phụ thuộc C** |
| I | Gửi thông báo chung qua Zalo OA + ZNS | zalo-crm-solar (module mới) | Kênh hợp pháp — cần OA | L | **TẠM HOÃN — chờ quyết định OA** |
| J | Tra tồn kho khi KH hỏi "còn hàng không" | crm-custom (module mới) | Không liên quan | L | Sau cùng |

Ước lượng: S ≈ 1–2 ngày, M ≈ 3–6 ngày, L ≈ 1–3 tuần (chưa gồm review/QA).

---

## Trình tự triển khai

### Đợt 1 — Quick wins, không vướng chính sách (song song được)

**F · Hồ sơ KH: bắt buộc tỉnh, không bắt buộc xã**
- Backend: validation contact create/update — `province` bắt buộc, `ward` optional. `backend/src/modules/contacts/contact-routes.ts`, `contact-sub-resource-routes.ts`; schema `backend/prisma/schema.prisma` (Contact: `province`, `district`, `ward`, `addressLine` — hiện đều optional).
- Frontend: `components/contacts/CustomerProfileDialog.vue`, `AddCustomerQuickDialog.vue`, `AddressAutocomplete.vue` — đánh dấu tỉnh là trường bắt buộc, bỏ ràng buộc xã (nếu có).
- Không cần migration nếu chỉ siết ở tầng validation. Kiểm data cũ thiếu tỉnh trước khi bật bắt buộc (chỉ chặn bản ghi mới / khi sửa).

**B · Nút tạo nhắc hẹn trên trang khách hàng**
- Tận dụng API sẵn có: `backend/src/modules/contacts/appointment-routes.ts` (+ `appointment-zalo-service.ts`, `appointment-reminder.ts`).
- Frontend: nhúng nút mở `components/appointments/AppointmentEditor.vue` (prefill contact) vào `views/ContactProfileView.vue`, `components/contacts/ContactDetailPanel.vue`, `views/MobileContactView.vue`.
- Không đổi schema/API. Chỉ đặt lại điểm vào (entry point) trên UI khách hàng.

**G · Fix "KH có Zalo nhưng báo chưa kết nối"**
- Nghi ngờ: khi chưa có bản ghi `Friend` và `Contact.hasZalo = null`, UI hiển thị như "chưa kết nối". Xem `backend/src/modules/contacts/contact-aggregate-display.ts` (`displayHasZalo = friends>0 ? true : contact.hasZalo`) và `backend/src/modules/chat/chat-routes.ts` (~dòng 1163–1177: refresh `hasZalo` khi mở hội thoại).
- Hướng xử lý: khi mở hội thoại / xem hồ sơ, chủ động `zaloOps.findUser(nick, phone)` để set `hasZalo` chính xác; tách UI thành 3 trạng thái rõ ràng: *đã xác minh có Zalo* / *chưa xác minh* / *xác minh không có Zalo* (thay vì gộp null với false).
- **Cần user xác nhận trước:** chụp lại đúng màn hình + trường hợp đang gặp để chốt nguyên nhân, tránh sửa nhầm.

Kết thúc Đợt 1: có demo được cho sếp (F + B nhìn thấy ngay; G là sửa lỗi).

### Đợt 2 — Điều tra + kết bạn từ cuộc gọi

**H · Audit 2 nick Zalo / 1 CRM**
- Câu hỏi họp: 2 nick (mỗi nick ~300 bạn) trên cùng 1 CRM có xem được danh sách bạn của nhau và có gửi/tương tác chồng chéo không.
- Đã biết từ code: `Friend` lưu **theo từng nick**; `Contact` là hồ sơ tổng hợp nên cả 2 nick đều thấy KH qua Contact. `campaign-service.ts` đã chặn 2 nick cùng kết bạn 1 người (`NOT EXISTS ... state='accepted'`).
- Việc cần làm:
  1. Rà luồng gửi tin/chiến dịch: hệ thống có chọn đúng nick **đang là bạn** với KH không, hay có thể gửi qua nick chưa kết bạn (→ gửi cho người lạ = rủi ro).
  2. Rà quyền xem: user thấy Friend của nick không được gán có đúng policy không (`zalo-scope.ts`, `zalo-access-middleware.ts`).
  3. Đối chiếu với chính sách Zalo về nhiều thiết bị/nhiều nick.
- Đầu ra: báo cáo + danh sách chỗ cần siết (có thể sinh việc code nhỏ). Kết quả có thể đổi phạm vi Đợt 3–4.

**D · Trạng thái Kết bạn + nút "Kết bạn" ở màn cuộc gọi**
- Backend: thêm API tra trạng thái kết bạn theo số điện thoại (nick nào đã là bạn / chưa), dùng lại `campaign-service.attemptFriendRequest()` cho hành động kết bạn; giữ nguyên trần `friend_action` (mặc định 30/ngày, burst 8/60s — `sdk-limit-service.ts`). **Không tăng trần.**
- Frontend: `views/CallHistoryView.vue`, `components/telephony/CallButton.vue`, `CallNotesPanel.vue`, `TelephonySoftphone.vue` — hiện chip "Kết bạn / Chưa KB Zalo" cạnh số; nút "Kết bạn" chỉ hiện khi `hasZalo !== false`.
- Phụ thuộc G (trạng thái hasZalo phải đáng tin trước).

### Đợt 3 — Import & địa chỉ sau sáp nhập

**E · Ánh xạ địa chỉ cũ → mới khi import KH**
- Backend: `backend/src/modules/contacts/contact-import-service.ts`, `contact-import-routes.ts`, `contact-import-types.ts`.
- Thêm bảng ánh xạ `địa chỉ cũ (tỉnh/huyện/xã) → địa chỉ mới (tỉnh/xã)`; khi import: match theo địa chỉ cũ trong file → ghi địa chỉ mới vào KH, giữ địa chỉ cũ để tham chiếu/đối chiếu.
- Xử lý case không match (fuzzy / cần review thủ công).
- **Cần user cung cấp:** nguồn dữ liệu ánh xạ sáp nhập chính thức (danh sách tỉnh/xã cũ ↔ mới).
- **Cần quyết định:** `zalo-crm-solar` giữ mô hình 3 cấp (`district`) hay chuyển sang 2 cấp (tỉnh + xã) như `crm-custom` đã dùng (`addressProvinceCode/Name`, `addressWardCode/Name`). Nếu chuyển → cần migration + cập nhật form/filter (`@@index([orgId, province, district])` sẽ đổi).

### Đợt 4 — Gửi hàng loạt *(TẠM HOÃN — chờ sếp duyệt)*

Giữ nguyên tài liệu kiến trúc đã trình. Khi được duyệt sẽ nâng cấp theo thứ tự:
1. **C** — xương sống queue: model `BroadcastCampaign/Batch/Recipient`, module `backend/src/modules/broadcast/`, worker chia lô + giãn tốc độ, tích hợp `zalo-rate-limiter`, bảng tiến độ.
2. **A** — UI gửi từ danh sách KH theo bộ lọc: chọn nhiều ảnh + nhiều người, xem trước số người thực gửi (sau khi loại không phải bạn).
3. **I** — tích hợp Zalo OA + ZNS: module `backend/src/modules/zalo-oa/`, quản lý token/template, gửi ZNS qua cùng `BroadcastCampaign` (`channel='oa'`), webhook trạng thái, báo cáo chi phí, định tuyến A/B.
- Việc phi kỹ thuật chạy song song ngay khi có quyết định: đăng ký OA doanh nghiệp, xác thực, soạn + chờ Zalo duyệt template.

### Đợt 5 — Tính năng nâng cao (sau cùng)

**J · Tra tồn kho khi KH hỏi "còn hàng không"**
- `crm-custom`: thêm module `inventory` (stock theo sản phẩm/kho, nhập–xuất, tồn hiện tại). Hiện `crm-custom` có `products/orders/order-formats` nhưng **chưa có model tồn kho**.
- Expose API read-only cho `zalo-crm-solar` tra qua contract idempotent hiện có (không nhân đôi ownership).
- `zalo-crm-solar`: trong hội thoại, tra nhanh tồn theo sản phẩm → gợi ý câu trả lời (thủ công hoặc AI suggestion).

---

## Việc cần user / sếp chốt

| # | Nội dung | Chặn hạng mục |
|---|----------|---------------|
| 1 | Xác nhận triệu chứng lỗi "chưa kết nối" (màn hình + trường hợp cụ thể) | G, D |
| 2 | Cung cấp dữ liệu ánh xạ địa chỉ cũ ↔ mới sau sáp nhập | E |
| 3 | Quyết định: giữ địa chỉ 3 cấp hay chuyển 2 cấp cho zalo-crm-solar | E |
| 4 | Duyệt kiến trúc gửi hàng loạt + trần rủi ro Kênh A | C, A |
| 5 | Quyết định có làm Zalo OA + ngân sách ZNS | I |
| 6 | Ưu tiên J (tồn kho) so với các việc khác | J |

---

## RELEVANT FILES

Backend:
- `backend/src/modules/contacts/contact-routes.ts`, `contact-sub-resource-routes.ts`, `contact-aggregate-display.ts`
- `backend/src/modules/contacts/appointment-routes.ts`, `appointment-zalo-service.ts`, `appointment-reminder.ts`
- `backend/src/modules/contacts/contact-import-service.ts`, `contact-import-routes.ts`, `contact-import-types.ts`
- `backend/src/modules/chat/chat-routes.ts` (~1163–1177 refresh hasZalo)
- `backend/src/modules/campaign/campaign-service.ts`, `campaign-routes.ts`
- `backend/src/modules/zalo/sdk-limit-service.ts`, `zalo-rate-limiter.ts`, `zalo-scope.ts`, `zalo-access-middleware.ts`
- `backend/prisma/schema.prisma` (Contact: province/district/ward/addressLine, hasZalo, zaloUid)

Frontend:
- `frontend/src/components/contacts/CustomerProfileDialog.vue`, `AddCustomerQuickDialog.vue`, `AddressAutocomplete.vue`, `ContactImportDialog.vue`, `ContactDetailPanel.vue`
- `frontend/src/views/ContactProfileView.vue`, `MobileContactView.vue`
- `frontend/src/components/appointments/AppointmentEditor.vue`
- `frontend/src/views/CallHistoryView.vue`, `frontend/src/components/telephony/CallButton.vue`, `CallNotesPanel.vue`, `TelephonySoftphone.vue`

## NEXT

1. User trả lời 6 điểm ở bảng "Việc cần user / sếp chốt".
2. Bắt đầu Đợt 1 (F + B) — không phụ thuộc gì thêm.
3. G sau khi có xác nhận triệu chứng.
