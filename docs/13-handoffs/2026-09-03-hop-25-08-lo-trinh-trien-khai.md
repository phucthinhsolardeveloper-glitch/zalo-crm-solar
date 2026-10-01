# Lộ trình triển khai — Cuộc họp 25/08/2026

Ngày lập: 2026-09-03. Nguồn: biên bản họp 25/08 + đọc code nhánh hiện tại.
Trạng thái: **ĐANG TRIỂN KHAI**. Đợt 1 (F + B + G) đã xong trên `master01`:
`6b8474e` (F), `cfc2eb2` (B), `f7831d7` (G). Các đợt sau chờ chốt theo bảng
"Việc cần user / sếp chốt".

Tài liệu kiến trúc phần gửi hàng loạt: `docs/13-handoffs/` không chứa — xem artifact "Kiến trúc gửi tin nhắn hàng loạt" đã trình sếp.

---

## Phân nhóm công việc

| ID | Hạng mục | Repo | Chính sách Zalo | Ước lượng | Trạng thái |
|----|----------|------|-----------------|-----------|------------|
| F | Hồ sơ KH + import: bắt buộc **tỉnh**, không bắt buộc **xã** | zalo-crm-solar | Không liên quan | S | ✅ Xong (bổ sung import 29/09) |
| B | Nút tạo nhắc hẹn ngay trên trang khách hàng | zalo-crm-solar | Không liên quan | S | ✅ Xong `cfc2eb2` |
| G | Fix: KH có Zalo nhưng báo "chưa kết nối / chưa làm" | zalo-crm-solar | Không liên quan | S–M | ✅ Xong `f7831d7` |
| H | Audit: 2 nick Zalo / 1 CRM — thấy & tương tác chồng chéo? | zalo-crm-solar | Cần đối chiếu chính sách | M (điều tra) | ✅ Audit + cảnh báo chéo |
| D | Trạng thái Kết bạn/Chưa KB + nút "Kết bạn" ở màn cuộc gọi | zalo-crm-solar | Giới hạn kết bạn — giữ trần | M | ✅ Đã triển khai 29/09 |
| E | Import KH: ánh xạ địa chỉ cũ → mới sau sáp nhập + chuyển Contact sang mô hình 2 cấp | zalo-crm-solar | Không liên quan | M | ✅ Xong 2026-09-30 — xem `docs/13-handoffs/2026-09-30-address-2tier.md` |
| C | Queue chia lô gửi tin nhắn hàng loạt | zalo-crm-solar | **Rủi ro khoá nick** | L | ✅ Đã duyệt 2026-09-30 — Phase 1 (backend+worker) xong, xem `docs/13-handoffs/2026-09-30-broadcast-phase1.md`. Phase 2 (FE) chưa làm |
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

**H · Audit 2 nick Zalo / 1 CRM** — ✅ Đã audit 2026-09-03 (chưa sinh code)

Câu hỏi họp: 2 nick (mỗi nick ~300 bạn) trên cùng 1 CRM có xem được danh sách
bạn của nhau và có gửi/tương tác chồng chéo không.

### Hệ thống đang hoạt động thế nào (theo code)

- `Friend` lưu **theo từng nick** (`Friend.zaloAccountId`); `Contact` là hồ sơ
  tổng hợp gom các `Friend` của mọi nick trong org về 1 KH.
- Quyền **xem nick** (`backend/src/modules/zalo/zalo-scope.ts` — `getZaloScope`):
  - `owner`/`admin` → thấy **mọi nick** trong org.
  - `leader`/`deputy` phòng X → thấy nick của user thuộc cây phòng X.
  - Nhân viên thường → chỉ nick mình sở hữu (`ownerUserId`) **hoặc** được cấp
    `ZaloAccountAccess`.
- Quyền **gửi qua nick** (`checkZaloAccess` trong `zalo-access-middleware.ts`):
  cùng luật trên + phải là `permission >= chat`.
- Aggregate hiển thị của Contact (score/status/preview tin cuối) tính **theo
  đúng nick mà viewer được thấy** (`computeAggregateDisplay(contact, visibleFriends)`
  trong `contact-routes.ts`) — nhân viên chỉ thấy chỉ số từ nick của mình.

### Trả lời từng ý

1. **2 nick cùng owner (1 user cắm 2 nick):** user đó thấy bạn của cả 2 nick;
   Contact gộp làm 1 KH, badge "Cùng chăm" hiện cả 2. → Thấy nhau, đúng thiết kế.
2. **2 nick khác owner:** nhân viên A (chỉ có nick A) **không** thấy danh sách
   bạn thô của nick B qua các màn nick-level; nhưng ở màn **Contact/hồ sơ KH**,
   mảng `friends` trả về gồm Friend của **mọi nick** (`{...contact}` spread ở
   `contact-routes.ts` list + detail) → A vẫn biết "KH này nick B cũng đang chăm"
   (badge "Đồng đội cùng chăm"). Chỉ số tổng hợp thì bị giới hạn theo scope.
   → Cố ý cho biết *có người khác đang chăm*, không cho xem sâu.
3. **Kết bạn hàng loạt (campaign):** `pickRandomEligibleContact` loại KH mà
   *bất kỳ* nick đã `state='accepted'` **và** KH nick hiện tại đã từng thử →
   2 nick **không** cùng gửi lời mời 1 người. ✅ Đã có chốt chặn.
4. **Nhắn tin trong hội thoại có sẵn:** `Conversation` gắn cứng 1 `zaloAccountId`
   → gửi luôn đúng nick đó, không lẫn.
5. **Mở hội thoại MỚI từ nick B cho KH nick A đang chăm:** `NewMessageDialog`
   → `lookup-by-phone` trên nick B → `ensure-by-uid` `attach:contactId`. Hệ
   thống **tạo Friend + Conversation thứ 2** trên nick B cho cùng KH, **không
   cảnh báo** "nick A đang chăm KH này" (ngoài badge "Cùng chăm").

### Chỗ có rủi ro / cần siết

| # | Vấn đề | Mức | Ghi chú |
|---|--------|-----|---------|
| H-1 | Mở chat mới từ nick B cho KH nick A đang chăm không cảnh báo | Vừa | 2 sale nhắn song song 1 KH; KH nhận 2 luồng. Nên hiện cảnh báo "KH đang được nick … chăm" trước khi `ensure-by-uid`. |
| H-2 | Gửi hàng loạt (Đợt 4) phải chọn đúng nick đã kết bạn với từng KH | Cao | Chưa có code; bước "lọc điều kiện" trong kiến trúc Kênh A phải chặn recipient mà nick chọn chưa kết bạn (không thì gửi cho người lạ = spam). |
| H-3 | Mảng `friends` cross-nick trả nguyên trong response Contact list/detail | Thấp | Là dữ liệu để render "Cùng chăm"; PII đã qua lớp `redactContact`. Không phải lỗ hổng, nhưng nếu siết privacy thì lọc `friends` theo scope luôn. |

### Chính sách Zalo (nhiều nick / 1 CRM)

- Mỗi nick = 1 tài khoản Zalo cá nhân độc lập, có trần riêng
  (`sdk-limit-service.ts`, per `zaloAccountId`). Cắm nhiều nick vào 1 CRM
  **không** làm Zalo coi là 1 — mỗi nick vẫn bị đánh giá spam riêng.
- Rủi ro thật: cùng nội dung gửi từ 2 nick tới cùng tệp KH trong thời gian
  ngắn → cả 2 nick dễ bị gắn cờ. Đợt 4 phải rải theo nick + chống trùng KH
  trong 1 chiến dịch (đã ghi ở kiến trúc: khoá theo `contactId`).

### Kết luận

Phần **xem chồng chéo**: đúng thiết kế, không cần sửa gấp (cân nhắc H-3 khi làm
privacy). Phần **tương tác chồng chéo**: H-1 nên thêm cảnh báo (việc nhỏ, có thể
gộp vào Đợt 2 cùng D); H-2 là ràng buộc bắt buộc của Đợt 4, không phải việc mới.

**D · Trạng thái Kết bạn + nút "Kết bạn" ở màn cuộc gọi** — đã rà "có sẵn chưa" 2026-09-03

### Đã có sẵn (KHÔNG viết lại)

| Phần | Có sẵn ở đâu |
|------|-------------|
| Gửi lời mời kết bạn + lời chào | `POST /api/v1/zalo-accounts/:accountId/friends/requests {userId, message}` + `components/chat/FriendInviteDialog.vue` |
| Tra trạng thái lời mời (theo UID) | `GET .../friends/requests/:userId/status` |
| Trạng thái kết bạn theo KH (mọi nick) | `GET /api/v1/contacts/:id/friendships` + `Friend.friendshipStatus` (`none` / `pending_sent` / `accepted`) |
| Phone → UID | `POST .../friends/lookup-by-phone` (⚠️ = `findUser`, bị Zalo throttle mạnh) |
| Trần chống spam | `sdk-limit-service.ts`: `friend_action` 30/ngày·8/60s, `friend_lookup` riêng |
| UI đầy đủ (nút Kết bạn, chip trạng thái, thu hồi, mời lại) | `components/chat/MessageThread.vue` — **chỉ ở màn chat** |

### Đã bổ sung 29/09/2026

Màn cuộc gọi (`views/CallHistoryView.vue`) đã có cột trạng thái kết bạn và nút
Kết bạn. Trạng thái lấy cùng query call log từ `Friend` trong DB; chỉ khi người
dùng chọn nick và bấm thao tác thì mới gọi `lookup-by-phone`, mở
`FriendInviteDialog` rồi gửi qua `POST .../friends/requests`.

### Ràng buộc chính sách Zalo (bắt buộc) — 🟡

- **Trạng thái kết bạn phải suy từ `Friend` rows có sẵn** (`friendships` endpoint,
  không gọi SDK). **TUYỆT ĐỐI không** gọi `lookup-by-phone`/`findUser` cho từng
  dòng call log để "kiểm tra" — đó là pattern spam, Zalo chặn `findUser` rất gắt
  ("Nick đã bị Zalo chặn tạm thời (quá nhiều lượt tra cứu)").
- Live `findUser` chỉ chạy khi sale **bấm tay** "Kết bạn" trên 1 dòng cụ thể.
- Gửi lời mời: giữ trần `friend_action` 30/ngày (không tăng), **1 người / lần**
  (không bulk), hiện số quota còn lại trong ngày.
- Chỉ cho số **đã thực sự có cuộc gọi** — không quét danh bạ / không auto.

Kết luận D: **đã triển khai** theo ràng buộc trên; trần chống spam tiếp tục được
backend áp dụng theo từng nick.

**H-1 · Cảnh báo khi mở chat mới cho KH nick khác đang chăm** — ✅ đã triển khai 29/09/2026

- Hiện trạng: `NewMessageDialog` → `ensure-by-uid` tạo Friend + Conversation thứ 2
  trên nick B mà không cảnh báo. Có widget "Đồng đội cùng chăm" nhưng không phải
  cảnh báo chặn trước khi tạo.
- Việc: trước khi `ensure-by-uid`, gọi `GET /contacts/:id/friendships` (đã có),
  nếu có nick khác `friendshipStatus='accepted'` → hiện xác nhận "KH đang được
  nick … chăm, vẫn mở luồng mới?". **Không đụng backend.**
- Chính sách Zalo: không liên quan (chỉ cảnh báo UI). Việc nhỏ, gộp cùng D.

Kết quả: trước khi tạo/mở luồng mới bằng nick khác, UI đọc `friendships` và yêu
cầu xác nhận nếu đã có nick khác kết bạn. Nếu không kiểm tra được trạng thái thì
fail-closed, không tạo luồng mới.

### Đợt 3 — Import & địa chỉ sau sáp nhập

Đã hoàn tất import bắt buộc có tỉnh hoặc đủ bộ ba địa chỉ cũ để tự chuyển đổi;
`Phường/Xã` hiện tại vẫn không bắt buộc nếu người dùng nhập địa chỉ mới ở cấp
tỉnh. Bộ dữ liệu `backend/src/shared/data/vietnam-sap-nhap-phuong-xa.csv` được
đóng gói cùng app.

**E · Ánh xạ địa chỉ cũ → mới khi import KH**
- Backend: `backend/src/modules/contacts/contact-import-service.ts`, `contact-import-routes.ts`, `contact-import-types.ts`.
- Khi import đủ `Tỉnh/TP cũ`, `Quận/Huyện cũ`, `Phường/Xã cũ`, hệ thống match theo bảng chính thức → ghi tỉnh/xã mới vào Contact và lưu địa chỉ cũ + mã xã mới trong `metadata.addressMigration`.
- Case một địa chỉ cũ có nhiều đích mới hoặc không có trong bảng bị chặn ở Preview với trạng thái cần review; không fuzzy-match và không tự đoán.
- Nguồn hiện tại: `vietnam-sap-nhap-phuong-xa.csv` do user cung cấp, 10.602 dòng.
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
| 2 | Xác nhận các dòng địa chỉ mơ hồ trong Preview import | E |
| 3 | ✅ Đã chốt 2026-09-30: chuyển sang 2 cấp (tỉnh + xã), bỏ district | E |
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

1. **Đợt 1 + Đợt 2 đã xong**; import cũng đã được siết bắt buộc tỉnh.
2. Chờ dữ liệu địa chỉ cũ ↔ mới chính thức để làm E.
3. Chờ OA/template/quyết định kênh gửi hợp lệ để mở C/A/I; không triển khai bulk
   trên tài khoản cá nhân. J (tồn kho) được lưu backlog sau cùng.

## G — cách xử lý đã chọn

Không có mô tả triệu chứng chính xác nên fix theo hướng hệ thống, an toàn:

- **Không** tự gọi `findUser` cho `hasZalo` null/false (giữ nguyên quyết định
  M52/M53). Chỉ ghi nhận `hasZalo=true` khi Zalo đã tự resolve (mở chat →
  `getUserInfo` trả profile) hoặc khi đã có Friend row / Zalo identity.
- `GET /contacts/:id` backfill `hasZalo=true` best-effort khi có bằng chứng.
- Các màn hiển thị dùng chung bộ tín hiệu 3 trạng thái; nhãn unknown đổi thành
  "Chưa kiểm tra".

Nếu vẫn còn màn nào báo sai, gửi ảnh chụp màn đó để chỉnh tiếp.
