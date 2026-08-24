# Audit: Provisioning OmiCall cho nhân viên Zalo CRM

**Phạm vi:** `zalo-crm-solar` — vì đây là hệ thống nhân viên kinh doanh thao tác chính (đã chốt trước đó: nhân viên gọi điện ở zalo-crm-solar, không phải crm-custom).
**Loại tài liệu:** Audit thuần — KHÔNG có thay đổi code nào trong quá trình lập báo cáo này.
**Ngày:** 20/08/2026

> **[UPDATE 19/08/2026] TÀI LIỆU NÀY ĐÃ LỖI THỜI Ở PHẦN KẾT LUẬN CHÍNH.** Toàn bộ audit dưới đây (bao gồm mục C, D, "Directory Sync + 1-click Claim") được viết dựa trên giả định sai: "OmiCall không có API tạo nhân viên/extension." Giả định đó chỉ đúng cho họ API Call Center (`/api/call_center/internal_phone/*`) — audit ban đầu **bỏ sót** họ API Employee riêng (`/api/agent/*`, doc tại `https://api.omicall.com/omicall-api/nhan-vien`), trong đó `POST /api/agent/invite` **tạo được nhân viên mới và trả về sip_user/password thật**. Người dùng đã phát hiện và chỉ ra thiếu sót này.
>
> **Đã triển khai thật** (không còn là đề xuất) theo hướng auto-invite, thay thế hoàn toàn kiến trúc "Directory Sync + 1-click Claim" ở mục dưới:
> - `backend/src/modules/telephony/omicall-agent-provisioning.ts` (mới) — gọi `POST /api/agent/invite` (fallback `GET-by-email` khi gặp lỗi `agent_exists`), map mọi user mới → `role_name: "Sale"` (mặc định least-privilege, chưa làm mapping theo role CRM), sinh password riêng biệt đạt chuẩn OmiCall (khác hẳn password đăng nhập CRM), lưu `sip_user`/`sip_password` (mã hoá) thẳng vào `User.omicallExtension`/`omicallExtensionSecret` — dùng lại đúng 2 cột đã có, không cần bảng mới.
> - Gọi từ `createUserAndSendLogin()` (`user-create-with-zalo-service.ts`) ngay sau khi transaction tạo User commit — **best-effort, không throw, không chặn/rollback việc tạo user** nếu OmiCall lỗi.
> - `CreateUserResult` có thêm field `omicall: { provisioned, sipUser?, error? }`, hiển thị trên `CreateUserWithZaloModal.vue` (banner xanh nếu cấp thành công, banner vàng + hướng dẫn gán tay nếu lỗi).
> - `omicall-directory.ts` (đọc-only, dùng để gán tay extension có sẵn) vẫn giữ nguyên, đã sửa comment sai ở đầu file.
> - Chưa làm: mapping `role_name` theo role CRM thật (đang mặc định "Sale" cho tất cả), hook disable/reactivate extension khi user bị vô hiệu hoá/kích hoạt lại.
>
> Phần audit A/B/C/D/E... bên dưới giữ nguyên nguyên trạng để tham khảo lịch sử điều tra, KHÔNG PHẢI hiện trạng code sau thay đổi này.

---

## A. Current implementation

### A.1 CRM User được tạo ở đâu

Có **2 đường tạo user**, không phải 1:

1. **`POST /api/v1/users/create-with-zalo`** (`backend/src/modules/system-notifications/user-create-with-zalo-routes.ts:48-95`, gọi `createUserAndSendLogin()` trong `user-create-with-zalo-service.ts:533`) — **đây là flow thật admin dùng** (xác nhận qua `frontend/src/components/users/CreateUserWithZaloModal.vue`). Bắt buộc `fullName`, `phone`, `confirmedUid` (đã verify số điện thoại có Zalo qua `checkZaloByPhone()` trước). Tự sinh mật khẩu tạm, tự gửi thông tin đăng nhập qua Zalo. Gate qua `requireGrant('user','create')`.
2. **`POST /api/v1/users`** (`backend/src/modules/auth/user-routes.ts:83-147`) — flow đơn giản hơn (email/phone + password thủ công), gate qua role cứng (`owner`/`admin`), không tích hợp Zalo. Không tìm thấy UI nào gọi endpoint này — có thể là API dự phòng/legacy.

**Cả 2 đường đều KHÔNG đụng gì tới OmiCall.** Tạo user xong, `omicallExtension`/`omicallExtensionSecret` mặc định `null`.

### A.2 OmiCall integration hiện hoạt động thế nào

Toàn bộ nằm trong `backend/src/modules/telephony/`:

| File | Vai trò |
|---|---|
| `omicall-token.ts` | Chỉ mã hoá/giải mã SIP password (AES-256-GCM, key `config.encryptionKey`). **Không phải OAuth/access-token minter.** |
| `omicall-status.ts` | Map trạng thái webhook OmiCall → status nội bộ. |
| `omicall-recording.ts` | Tải file ghi âm từ OmiCall, lưu lại vào storage nội bộ (SSRF-guard). |
| `omicall-history-sync.ts` | Chủ động kéo lịch sử cuộc gọi qua `POST /api/v3/call-transaction/search`, header `x-api-key` = API key thô. |
| `omicall-public-routes.ts` | Webhook nhận CDR từ OmiCall — xác thực bằng shared-secret (`?key=` hoặc header `x-webhook-key`). |
| `omicall-crm-forward.ts` | *(mới thêm phiên trước)* relay CDR sang crm-custom, không liên quan phạm vi audit này. |
| `telephony-routes.ts` | REST cho client: `connect-config` (trả SIP credential đã giải mã cho SDK), `resolve-conversation-target`, `POST/PATCH /calls`, `POST /sync`. |

### A.3 Extension hiện lưu ở đâu

`User.omicallExtension` (string) + `User.omicallExtensionSecret` (ciphertext AES-GCM) — **thẳng trên bảng `users`** (`schema.prisma:263-267`, thêm từ "Phase Omicall telephony 2026-07-25"). Không có bảng mapping riêng.

### A.4 OmiCall user/uuid hiện lưu ở đâu

**Không lưu.** OmiCall trả về `agent_id` khi list extension (đã verify: `GET /internal_phone/list` trả `agent_id`, `full_name`, `email` cùng `sip_user`/`password`) nhưng **không có field nào trong `User` lưu `agent_id` này**. Liên kết hiện tại hoàn toàn dựa vào `sip_user` (extension number) làm khoá — không có ID định danh OmiCall nào khác được lưu.

### A.5 SDK/WebRTC hay Click-to-Call API đang dùng

**WebSDK v3** (`https://cdn.omicrm.com/sdk/web/3.0.42/core.min.js`), nạp trực tiếp ở frontend (`use-omicall-softphone.ts`), gọi `OMICallSDK.init()` → `register({sipRealm, sipUser, sipPassword})` → `makeCall()`. Đây là **client-side WebRTC softphone**, không phải REST Click-to-Call API (loại API mà server gọi hộ, không cần WebRTC ở browser — OmiCall cũng có nhưng **không được dùng** trong code hiện tại).

### A.6 Credential OmiCall xử lý thế nào

- **API key** (`OMICALL_API_KEY`): 1 biến env global, dùng `x-api-key` thẳng cho Call Transaction API — không theo org (đã ghi nhận ở audit trước, chấp nhận được vì hiện chỉ 1 công ty dùng).
- **SIP password nhân viên**: mã hoá AES-256-GCM khi ghi (`PUT /users/:id/omicall-extension`), giải mã khi trả cho `connect-config` (chỉ chính chủ) — đã audit ở phiên trước, không có lỗ hổng.

### A.7 Khi CRM User chưa có OmiCall extension — hệ thống xử lý ra sao HIỆN TẠI

- `TelephonySoftphone.vue:2` — `v-if="enabled"` → **toàn bộ widget điện thoại trên topnav biến mất hoàn toàn**, không có thông báo gì.
- `MessageThread.vue:305-313` — nút gọi trong khung chat **vẫn luôn hiện** (chỉ điều kiện theo `threadType==='user'`, không theo extension) — bấm vào sẽ throw lỗi `'Tổng đài Omicall chưa sẵn sàng'` (`use-omicall-softphone.ts:367`) hiện dưới dạng toast.
- **→ Đây là 1 điểm không nhất quán UX** đã ghi nhận: 1 chỗ ẩn hẳn, 1 chỗ hiện nhưng báo lỗi khi bấm. Not blocking, nhưng nên đồng bộ khi implement.
- `PUT /users/:id/omicall-extension` (`user-routes.ts:294`) **đã có sẵn check trùng extension** trong cùng org trước khi gán — điểm cộng, tái dùng được.

---

## B. OmiCall integration flow hiện tại (tóm tắt luồng thật)

```
Admin gõ tay extension+password (biết từ đâu đó, KHÔNG có UI hỗ trợ tra cứu)
        ↓
PUT /users/:id/omicall-extension  →  check trùng  →  encrypt  →  lưu User.omicallExtension(Secret)
        ↓
User login  →  Frontend gọi GET /telephony/omicall/connect-config
        ↓
Nếu có đủ extension+secret  →  trả sipRealm/sipUser/sipPassword (đã giải mã)  →  WebSDK register()  →  gọi được
Nếu KHÔNG có  →  503  →  enabled=false  →  widget điện thoại biến mất
```

**Không có bước "provisioning" nào tự động** — toàn bộ là 1 hành động thủ công duy nhất (gõ form), tách rời hoàn toàn khỏi việc tạo user.

---

## C. Missing pieces

1. **Không có liên kết tự động giữa "tạo CRM User" và "cấp OmiCall extension"** — 2 hành động, 2 màn hình, đôi khi cách nhau nhiều ngày (rủi ro quên).
2. **Không có UI tra cứu extension đã tạo trên OmiCall** — admin phải tự nhớ/copy password từ đâu đó ngoài hệ thống, gõ tay vào form → dễ gõ sai (không có validate khớp với OmiCall thật khi lưu, chỉ validate không trùng nội bộ).
3. **Không lưu `agent_id` (OmiCall)** — không có ID định danh ngoài `sip_user`, khó đối chiếu chéo nếu OmiCall đổi số nội bộ của 1 nhân viên.
4. **Vô hiệu hoá/kích hoạt lại CRM User KHÔNG đụng gì tới OmiCall** — `DELETE /users/:id` và `PUT /users/:id {isActive:true}` chỉ đổi `isActive`, extension trên OmiCall vẫn "sống" nguyên — nhân viên nghỉ việc vẫn có thể dùng SIP credential cũ gọi được nếu họ còn lưu lại (rủi ro bảo mật thật).
5. **Không có unique constraint ở DB cho `(orgId, omicallExtension)`** — chỉ có app-level check (race condition lý thuyết nếu 2 request đồng thời).
6. **Không có audit trail riêng cho hành động gán/gỡ extension** — có `ActivityLog` chung (`writeAudit()`) nhưng route `omicall-extension` hiện **chưa gọi** `writeAudit()` (khác với `deactivate`/`handoff`/`reset_password` đều có).

---

## D. API capabilities đã xác minh (test trực tiếp phiên trước + tài liệu chính thức)

| Capability | Trạng thái | Bằng chứng |
|---|---|---|
| `GET /api/auth?apiKey=` → Bearer access_token | ✅ **Đã verify sống** | Gọi thật, nhận access_token JWT thật |
| `GET /api/call_center/internal_phone/list` (Bearer) | ✅ **Đã verify sống** | Trả đúng `sip_user`, `password` (**plaintext**), `domain`, `agent_id`, `full_name`, `email` của 2 extension thật |
| `POST /internal_phone/update`, `PUT /internal_phone/status`, `GET /internal_phone/refresh`, `GET /extensions/detail` | ⚠️ Có trong tài liệu, **chưa test sống** | Tài liệu Call Center |
| `POST /api/v3/call-transaction/search` (`x-api-key`) | ✅ **Đã verify sống** | Kéo được CDR thật |
| **Tạo mới internal_phone/extension** | ❌ **API chưa xác minh được — không tồn tại theo tài liệu công khai** | Đã hỏi lại rõ ràng qua tài liệu chính thức: chỉ có list/update/status/refresh/detail cho extension **đã tồn tại**, không có "add"/"create". Tài liệu tự nói: "để thêm extension mới cần dùng giao diện quản lý Omicall trực tiếp". |
| Webhook event `contact` (khác `call`) | ⚠️ Có tên trong tài liệu, **không có schema chi tiết** | Không rõ có liên quan provisioning nhân viên hay không |

---

## E. Proposed architecture

**Ràng buộc cứng phải chấp nhận:** vì OmiCall không có API tạo extension, **"zero-touch" hoàn toàn (tạo CRM User → tự động có extension) là bất khả thi** với năng lực API hiện có — đây là giới hạn từ OmiCall, không phải thiếu sót thiết kế. Bất kỳ kiến trúc nào cũng phải có 1 bước người thật tạo extension trên OmiCall dashboard.

**Kiến trúc đề xuất: "Directory Sync + 1-click Claim"** — thu hẹp phần thủ công xuống mức tối thiểu (chỉ còn đúng việc OmiCall bắt buộc phải làm tay), tự động hoá phần còn lại:

1. **Admin tạo extension mới trên OmiCall dashboard** (không tránh được — ~2 phút/nhân viên mới).
2. **CRM có 1 endpoint "Đồng bộ danh sách extension từ OmiCall"** — gọi `GET /internal_phone/list`, so sánh với `User.omicallExtension` hiện có trong org → trả về danh sách "extension đã tồn tại trên OmiCall nhưng CHƯA gán cho ai trong CRM".
3. **Admin chọn từ dropdown** (không gõ tay password nữa) → hệ thống tự lấy `sip_user`+`password` từ chính response API, mã hoá, lưu — loại bỏ hoàn toàn bước copy-paste thủ công dễ sai.
4. Đặt bước này làm **bước tuỳ chọn ngay sau khi tạo user** (trong `CreateUserWithZaloModal.vue`, hoặc để riêng trong `UserEditPanel.vue` như hiện tại) — không bắt buộc, vì không phải nhân viên nào cũng cần gọi điện.

### Lifecycle đề xuất

```
CREATE CRM USER (giữ nguyên createUserAndSendLogin() hiện có — không đổi)
     ↓
[TÙY CHỌN] PROVISION: admin chọn 1 extension "chưa gán" từ danh sách đồng bộ OmiCall
     ↓
SAVE MAPPING: tái dùng PUT /users/:id/omicall-extension hiện có (thêm writeAudit)
     ↓
USER READY TO CALL: connect-config hiện có, KHÔNG cần đổi gì (đã hoạt động đúng)

DISABLE CRM USER (DELETE /users/:id)
     ↓
NẾU có omicallExtension: best-effort gọi PUT /internal_phone/status?enabled=false
     ↓ (log kết quả vào ActivityLog, KHÔNG chặn việc vô hiệu hoá user nếu OmiCall lỗi/timeout)
CRM User isActive=false (như cũ)

REACTIVATE CRM USER (PUT /users/:id {isActive:true})
     ↓
NẾU có omicallExtension: best-effort gọi PUT /internal_phone/status?enabled=true
     ↓ (best-effort tương tự)
CRM User isActive=true (như cũ)
```

---

## F. Database changes cần thiết

**Không cần bảng mới cho phần lõi** — `User.omicallExtension`/`omicallExtensionSecret` tái dùng được nguyên vẹn.

| Thay đổi | Bắt buộc? | Lý do |
|---|---|---|
| `@@unique([orgId, omicallExtension])` (partial, where not null) trên `User` | Nên có | Đóng race condition TOCTOU của app-level check hiện tại |
| Field `omicallAgentId String?` trên `User` | Tuỳ chọn | Lưu `agent_id` OmiCall trả về — hữu ích nếu sau này cần đối chiếu chéo, không bắt buộc cho luồng cơ bản |
| Field `omicallExtensionSyncedAt DateTime?` | Tuỳ chọn | Biết lần cuối "Đồng bộ danh sách" chạy, để cache phía client |
| Bảng audit riêng | **Không cần** | Tái dùng `ActivityLog` có sẵn (`writeAudit()`), chỉ cần thêm action mới `user.omicall_extension_assigned/disabled/reenabled` |

→ Nếu chỉ làm phần lõi (E mục 1-4), **1 migration nhỏ duy nhất** (thêm unique constraint) là đủ, có thể bỏ qua nếu chấp nhận rủi ro race condition ở quy mô nhỏ (2-3 extension hiện tại).

---

## G. Implementation plan theo từng bước (đề xuất — CHƯA làm)

1. **Backend:** hàm `listUnassignedOmicallExtensions(orgId)` — gọi `/api/auth` rồi `/internal_phone/list`, lọc bỏ extension đã có trong `User.omicallExtension` của org đó. Expose `GET /api/v1/telephony/omicall/available-extensions` (`requireGrant('user','edit')` hoặc tương đương).
2. **Backend:** thêm `writeAudit()` vào `PUT /users/:id/omicall-extension` (hiện đang thiếu, không nhất quán với các route khác trong cùng file).
3. **Backend:** extend `DELETE /users/:id` và nhánh `isActive:true` của `PUT /users/:id` — gọi best-effort `PUT /internal_phone/status`, log ActivityLog, try/catch không throw.
4. **Frontend:** `UserEditPanel.vue` — thêm dropdown "Chọn extension có sẵn" (gọi API bước 1) cạnh ô nhập tay hiện tại (giữ ô nhập tay làm fallback).
5. **Frontend (tuỳ chọn):** thêm bước tương tự ngay sau khi tạo user thành công trong `CreateUserWithZaloModal.vue`.
6. **Test:** unit test cho hàm diff extension (mock response OmiCall), test route disable/reactivate best-effort (mock OmiCall lỗi → user vẫn deactivate được).
7. **Migration:** thêm unique constraint (mục F) nếu chọn làm.

---

## H. Risks

1. **`/internal_phone/list` trả password dạng plaintext qua mạng** (đã verify) — bước đồng bộ mới phải mã hoá NGAY khi nhận, không log response thô ra console/log file.
2. **Best-effort disable là 1 chiều** — nếu OmiCall down lúc deactivate user, extension vẫn "sống" bên OmiCall. Cần ít nhất hiển thị cảnh báo "chưa đồng bộ được với OmiCall" cho admin biết để tự vào dashboard tắt tay, hoặc 1 job retry định kỳ (chưa có hạ tầng cron cho telephony — xem audit trước).
3. **Race condition gán trùng extension** — hiện chỉ có app-level check, nên thêm DB constraint (mục F) nếu muốn chặn tuyệt đối.
4. **API key OmiCall là global (1 org)** — kiến trúc "sync directory" này giả định 1 deployment zalo-crm-solar ↔ 1 tài khoản OmiCall. Nếu sau này host nhiều công ty trên cùng instance, cần thiết kế lại theo per-org credential (ngoài phạm vi audit này).
5. **Rate limit `/internal_phone/list` và `/api/auth` chưa biết** — nên cache ngắn hạn (30-60s) phía backend cho endpoint đồng bộ, tránh gọi OmiCall mỗi lần admin mở form.

---

## I. Các API OmiCall cần xác nhận thêm với OmiCall Tech

1. Có cách nào (kể cả ngoài tài liệu public, qua support/sale) để **tạo extension mới bằng API** không, hay bắt buộc 100% qua dashboard?
2. `PUT /internal_phone/status?enabled=false` có **thực sự chặn nhận/gọi cuộc gọi ngay lập tức**, hay chỉ ẩn khỏi danh sách hiển thị?
3. Rate limit của `/internal_phone/list` và `/api/auth` — bao nhiêu request/phút?
4. `access_token` từ `/api/auth` có thời hạn chính xác bao lâu (tài liệu ghi "24 giờ" ở 1 chỗ, không rõ áp dụng cho endpoint nào) — cần refresh theo cơ chế gì?
5. Có API xoá/archive hẳn 1 extension (khác disable tạm) khi nhân viên nghỉ hẳn không?

---

## J. Danh sách file sẽ cần sửa ở bước implementation (chỉ để tham khảo — CHƯA sửa)

**Backend**
- `backend/src/modules/telephony/telephony-routes.ts` hoặc file mới `omicall-directory.ts` — endpoint đồng bộ danh sách extension
- `backend/src/modules/auth/user-routes.ts` — thêm `writeAudit()` cho `omicall-extension`; extend `DELETE /:id` + `PUT /:id` cho best-effort disable/reactivate
- `backend/prisma/schema.prisma` — unique constraint (nếu chọn làm) → 1 migration mới

**Frontend**
- `frontend/src/components/rbac/UserEditPanel.vue` — thêm dropdown chọn extension có sẵn
- `frontend/src/components/users/CreateUserWithZaloModal.vue` — tuỳ chọn thêm bước gán extension sau khi tạo user
- Composable mới, ví dụ `frontend/src/composables/use-omicall-directory.ts`

---

**DỪNG LẠI ở đây theo yêu cầu — chưa implement gì.**
