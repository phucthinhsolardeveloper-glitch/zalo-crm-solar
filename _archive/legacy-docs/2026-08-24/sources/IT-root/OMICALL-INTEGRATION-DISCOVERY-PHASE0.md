# OmiCall Integration — Phase 0: Discovery & Architecture Audit

**Loại tài liệu:** Discovery/audit ban đầu (19/08) + cập nhật sau khi triển khai thật (19-20/08) — các phần cập nhật đánh dấu rõ **[UPDATE]**.
**Phạm vi:** So sánh 2 hệ thống — `crm-custom` (business CRM, system of record) và `zalo-crm-solar` (kênh Zalo + softphone), vì cả hai **đã có** tích hợp OmiCall ở các mức độ khác nhau.
**Ngày:** 19/08/2026

> **[UPDATE 19/08 tối]** Đã test bằng tài khoản OmiCall trial thật (extension 100/101), kéo được lịch sử cuộc gọi thật ở cả 2 hệ, kết nối relay zalo-crm-solar → crm-custom hoạt động. Phát hiện và sửa: (1) `crm-custom` **thực ra đã có sẵn giao diện gọi điện đầy đủ** (mục 2/10 dưới đây đã sai — sửa lại), chỉ thiếu SIP password nên chưa gọi được; (2) SIP password của `crm-custom` đã được mã hoá AES-256-GCM (không còn plaintext); (3) rà lại kỹ RBAC route telephony của `zalo-crm-solar` — **không phải lỗ hổng thật** như đánh giá ban đầu (xem mục 8).

---

## 1. Current architecture

Hai hệ thống tách biệt hoàn toàn (2 repo, 2 database Postgres riêng, không có API nào gọi chéo nhau hiện tại):

- **`crm-custom`** — NestJS 11 (`apps/api`, port 3010) + Next.js 16 (`apps/web`), Prisma 6/PostgreSQL 16, BullMQ+Redis, RBAC 4 role cứng (SUPER_ADMIN/MANAGER/LEADER/USER) qua `buildAccessFilter`. Đây là "sổ cái" Customer/Lead/Order/Payment.
- **`zalo-crm-solar`** — Fastify 5 (`backend`, port 3080) + Vue 3 (`frontend`), Prisma 7/PostgreSQL, BullMQ+Redis (dùng hẹp hơn), RBAC theo permission-group qua `requireGrant()`. Đây là kênh chat Zalo + đã có sẵn module **`telephony`** làm lớp softphone/click-to-call.

**Điểm bất ngờ quan trọng nhất của Phase 0 này:** cả hai hệ **đã có tích hợp OmiCall thật, đang chạy code, không phải khung sườn** — nhưng phục vụ hai mục đích khác nhau, không trùng lặp 1:1:

| | `crm-custom` | `zalo-crm-solar` |
|---|---|---|
| Mục đích chính | Ghi nhận **lịch sử cuộc gọi vào hồ sơ Lead/Customer** (CDR ingestion qua webhook) + đồng bộ **chủ sở hữu Lead → OmiCall contact** (outbound) | **Softphone/click-to-call trực tiếp trong UI** gắn với hội thoại Zalo (ZCC), đồng bộ lịch sử cuộc gọi cá nhân |
| Webhook nhận CDR | Có, qua `webhook-endpoints` framework chung | Có, endpoint riêng cho telephony |
| Đồng bộ lịch sử cuộc gọi | Bị động (chỉ qua webhook) | Chủ động (nút "Sync" gọi Call Transaction API) + webhook |
| Lưu SIP password | ~~Plaintext~~ **[UPDATE] Đã mã hoá AES-256-GCM** (19/08) | AES-256-GCM mã hoá |
| Test coverage | 0 test | 6 file test (424 dòng) |
| RBAC trên route | SUPER_ADMIN cho quản trị, role-scope cho đọc | Không dùng `requireGrant()`, nhưng **[UPDATE] đã rà lại: mọi route tự self-scope đúng theo chủ sở hữu/quyền hội thoại** — không phải lỗ hổng thật |
| Giao diện gọi điện (click-to-call) | **[UPDATE] Đã có sẵn, đầy đủ** (`OmiCallProvider`, popup cuộc gọi, tra cứu Lead/Customer khi có cuộc gọi đến, ghi chú trong cuộc gọi) — mục 2/10 bản gốc ghi sai là "chưa có" | Đã có sẵn (`TelephonySoftphone.vue`) |

---

## 2. Relevant modules

| Area | File/path | Responsibility | Why relevant |
|---|---|---|---|
| **crm-custom** — Auth | `apps/api/src/modules/auth/` | JWT 1h + refresh 7d rotation, API key SHA256 | Pattern để lưu credential OmiCall theo đúng convention hiện có |
| crm-custom — API key | `apps/api/src/modules/api-keys/api-keys.service.ts` | Sinh `crm_<hex>`, chỉ lưu hash | Convention lưu secret của repo |
| crm-custom — SIP config | `packages/database/prisma/schema.prisma:424-439` (`UserSipConfig`) | 1:1 User↔SIP credential OmiCall | Đã tồn tại, nhưng **không có service CRUD nào được tìm thấy** — dữ liệu có model nhưng chưa chắc có UI/API quản lý |
| crm-custom — Call model | `schema.prisma:1078-1108` (`CallLog`), `:1112-1126` (`CallFeedback`) | Lưu CDR đã match vào Lead/Customer, AI phân tích, feedback | Đây là nơi cuộc gọi "hạ cánh" trong CRM thật |
| crm-custom — Call ingestion | `apps/api/src/modules/call-logs/` (`call-logs.service.ts`, `omicall-webhook.controller.ts`) | `upsertFromOmicallCdr()` — match sipUser→UserPhone→Lead/Customer, tự chuyển Lead status, trigger AI summary | Logic nghiệp vụ cốt lõi, đã hoạt động |
| crm-custom — Outbound sync | `apps/api/src/modules/omicall/` | Đồng bộ chủ Lead → OmiCall contact khi đổi người phụ trách | Không liên quan tới lịch sử cuộc gọi, mục đích khác |
| crm-custom — Webhook framework | `apps/api/src/modules/webhook-endpoints/` | Slug + secret (SHA256), `DynamicWebhookGuard` tái dùng được | Nền tảng chung cho mọi webhook 3rd-party, OmiCall đang dùng lại |
| crm-custom — Reference integration | `apps/api/src/modules/lark-sync/` | Token cache Redis, HTTP client mỏng, BullMQ processor, **có test** | Template tốt nhất để copy pattern cho OmiCall |
| crm-custom — Job infra | `apps/api/src/modules/cron-run/`, `app.module.ts` (`BullModule.forRoot`, `ScheduleModule.forRoot`) | Wrapper theo dõi job (`CronRunService.track()`) | Sẵn sàng cho job đồng bộ/token-refresh tương lai |
| **zalo-crm-solar** — User model | `schema.prisma:263-267` | `omicallExtension`, `omicallExtensionSecret` (AES-GCM) | Model SIP credential tốt hơn crm-custom về bảo mật |
| zalo-crm-solar — Telephony module | `backend/src/modules/telephony/*` (6 file, 423+ dòng riêng routes) | Token/encrypt, status mapper, recording mirror, history sync, webhook, REST routes | Tích hợp OmiCall gần hoàn chỉnh nhất hiện có trong cả 2 repo |
| zalo-crm-solar — Call model | `schema.prisma:330-369` (`TelephonyCall`) | Lưu CDR, gắn `conversationId`/`contactId` | Gắn cuộc gọi vào ngữ cảnh hội thoại Zalo cụ thể |
| zalo-crm-solar — Config | `backend/src/config/index.ts:53-75` | Tập trung hoá toàn bộ biến `OMICALL_*` | Pattern sạch hơn crm-custom (không rải `process.env` trực tiếp) |
| zalo-crm-solar — Test | `backend/tests/omicall-*.test.ts` (6 file) | Unit test cho status/encrypt/pagination/webhook/ZCC-target | Bằng chứng module này đã được kiểm thử nghiêm túc |

---

## 3. Existing domain model

**User/Employee**
- `crm-custom`: `User` (role, department, team, employeeLevel) — **không có** field call-center trên User; tách riêng `UserPhone` (gán số nội bộ, có lịch sử `UserPhoneHistory`) và `UserSipConfig` (1:1, `sipRealm/sipUser/sipPassword` — **plaintext**).
- `zalo-crm-solar`: `omicallExtension` + `omicallExtensionSecret` (mã hoá) nằm **thẳng trên bảng `User`** — đơn giản hơn, ít bảng phụ hơn.

**Customer/Contact**
- `crm-custom`: `Customer.phone` + bảng phụ `CustomerPhone` (nhiều số phụ), dedup chuẩn hoá số khi insert.
- `zalo-crm-solar`: `Contact.phone/phone2/phone3/phonesExtra(Json)` + `phoneNormalized` (index sẵn, chuẩn hoá 84xxx tự động) — có helper `firstContactPhone()` chọn số hợp lệ đầu tiên.

**Phone number** — cả 2 hệ đều chuẩn hoá số VN nhưng theo 2 cách khác nhau (không dùng chung thư viện/format).

**Call/Activity**
- `crm-custom`: `CallLog` (gắn `matchedEntityType/Id`, `matchStatus`, `omicallUserId`, AI `analysis`) + `Activity` (timeline chung mọi loại sự kiện) + `CallFeedback`.
- `zalo-crm-solar`: `TelephonyCall` (gắn `conversationId` + `contactId` trực tiếp, có `provider` phân biệt Stringee cũ vs OmiCall mới).

**Conversation** — chỉ tồn tại ở `zalo-crm-solar` (mô hình chat Zalo). `crm-custom` không có khái niệm hội thoại, chỉ có Activity timeline rời rạc.

**Assignment/Owner**
- `crm-custom`: `Lead.assignedUserId`/`Customer.assignedUserId` — là nguồn để đồng bộ *ra* OmiCall (module `omicall`).
- `zalo-crm-solar`: `TelephonyCall.ownerUserId`/`peerUserId` — chỉ dùng nội bộ, không đồng bộ ngược lên OmiCall.

---

## 4. Existing integration pattern

Cả 2 repo **đều KHÔNG có** một "integration framework" tổng quát kiểu plugin — mỗi tích hợp là 1 module riêng theo pattern lặp lại:

1. Đọc credential từ env var (global, không theo org/tenant ở cả 2 hệ — kể cả `zalo-crm-solar` vốn multi-tenant theo `orgId` cũng dùng `OMICALL_API_KEY` **global**, không per-org).
2. Nếu thiếu credential → tắt tính năng, log cảnh báo, không throw (graceful degrade) — thấy nhất quán ở `lark-sync`, `omicall` (crm-custom), `telephony` (zalo-crm-solar).
3. Gọi HTTP thẳng bằng `fetch`, không có SDK OmiCall chính thức nào được cài.
4. Với luồng bất đồng bộ (đồng bộ contact, sync lịch sử) → BullMQ hoặc endpoint gọi tay, không có message bus chung.
5. Inbound webhook → mỗi hệ có 1 pattern xác thực khác nhau (xem mục 9), không dùng chung.

Điểm khác biệt: `crm-custom` có 1 framework webhook **tái dùng được** (`webhook-endpoints` + `DynamicWebhookGuard`) — bất kỳ nhà cung cấp mới nào cũng đăng ký 1 slug+secret qua đó. `zalo-crm-solar` **không có** framework tương tự — webhook OmiCall là endpoint viết tay duy nhất trong toàn repo.

---

## 5. OmiCall capability mapping

| CRM requirement | OmiCall capability | OmiCall endpoint | CRM module affected |
|---|---|---|---|
| Xác thực gọi API | API Key → Access Token | `GET /api/auth?apiKey=` | *(Ghi chú: cả 2 module thật hiện có KHÔNG dùng luồng này — xem mục 12, Unknown #1)* |
| Quản lý extension nhân viên | Call Center — Internal Extension | `GET/POST /api/call_center/internal_phone/*`, `/extensions/detail` | `UserSipConfig` (crm-custom) / `User.omicallExtension` (zalo-crm-solar) — **hiện provision thủ công trên dashboard OmiCall, chưa gọi API này** |
| Định tuyến cuộc gọi (nhóm, IVR, hotline) | Call Center — Ring Group / Call Script / Hotline | `/internal_group/*`, `/call_script/*`, `/hotline/*` | Chưa có module nào dùng — ngoài phạm vi 2 tích hợp hiện tại |
| Lấy lịch sử cuộc gọi | Call Transaction v3 | `POST /api/v3/call-transaction/search` | `call-logs` (crm-custom, qua webhook thụ động) / `telephony` (zalo-crm-solar, chủ động qua `omicall-history-sync.ts`) |
| Nhận sự kiện cuộc gọi real-time | Webhooks (`ringing/answered/hangup`) | `POST /api/webhooks/register`, nhận tại URL tự khai báo | `omicall-webhook.controller.ts` (crm-custom) / `omicall-public-routes.ts` (zalo-crm-solar) |
| Gọi điện ngay trong trình duyệt | WebSDK v3 | `OMICallSDK.init/register`, sự kiện `ringing/accepted/ended` | `telephony-routes.ts` `connect-config` (zalo-crm-solar) — crm-custom **chưa có UI click-to-call** |
| Đồng bộ chủ sở hữu Lead vào OmiCall | Contact API (không thuộc 6 tài liệu được giao, tự tìm thấy trong code) | `POST /api/v2/contact/{search,add,update}` | `omicall` module (crm-custom) — **không có trong tài liệu được giao đọc**, chỉ xác nhận qua code |

---

## 6. Proposed architecture

**Không đề xuất viết lại từ đầu** — cả 2 tích hợp hiện có đều hoạt động, có domain phù hợp với vai trò từng hệ (crm-custom = hồ sơ khách hàng/CDR chính thức; zalo-crm-solar = trải nghiệm gọi trực tiếp gắn hội thoại Zalo). Đề xuất tối thiểu:

1. **Không hợp nhất 2 module OmiCall thành 1** trừ khi có yêu cầu nghiệp vụ rõ ràng (xem Unknown #2) — chi phí hợp nhất cao, rủi ro phá vỡ 2 luồng đang chạy.
2. **Nếu cần "1 nguồn sự thật" cho lịch sử cuộc gọi trên hồ sơ khách hàng**: `zalo-crm-solar` nên **đẩy sự kiện cuộc gọi đã hoàn tất sang `crm-custom`** qua chính framework `webhook-endpoints` đã có sẵn ở crm-custom (đăng ký 1 `WebhookEndpoint` nội bộ, `zalo-crm-solar` gọi vào như 1 "provider" mới) — tái dùng hạ tầng, không xây message bus mới.
3. **Chuẩn hoá credential OmiCall**: chuyển `UserSipConfig.sipPassword` (crm-custom, đang plaintext) sang mã hoá theo đúng pattern `zalo-crm-solar` đã làm (AES-256-GCM) — không cần thêm dependency mới, cả 2 stack đều có sẵn Node `crypto`.
4. **Job đồng bộ định kỳ**: nếu cần tự động đồng bộ lịch sử cuộc gọi (thay vì chỉ chờ webhook), thêm `@Cron`/`cronRunService.track()` (crm-custom) hoặc `node-cron` theo pattern `friend-sync-cron.ts` (zalo-crm-solar) — hạ tầng đã sẵn, không cần thêm queue mới.

---

## 7. Data model impact

| | Reuse được | Cần thêm | Field cần thêm | Cần migration? |
|---|---|---|---|---|
| crm-custom | `CallLog`, `CallFeedback`, `Activity`, `UserPhone`, `UserSipConfig`, `webhook-endpoints` framework | Service CRUD cho `UserSipConfig` (model có, service không tìm thấy) | Không cần field mới cho các luồng hiện tại | **Không** cho việc audit này; sẽ cần 1 migration nhỏ nếu đổi `sipPassword` sang cột mã hoá (đổi kiểu lưu, không đổi tên cột) |
| zalo-crm-solar | `TelephonyCall`, `Contact.phone*`, `User.omicallExtension*`, toàn bộ module `telephony` | Không cần entity mới cho phạm vi hiện tại | Không | **Không** |
| Liên hệ 2 hệ (nếu làm mục 6.2) | — | 1 bảng mapping `TelephonyCall.id ↔ CallLog.id` hoặc field `externalId` tái dùng như `CallLog.externalId` đã có sẵn | Có thể chỉ cần field `sourceSystem` trên `CallLog` nếu muốn phân biệt nguồn (crm-custom trực tiếp vs zalo-crm-solar chuyển sang) | **Có**, nhưng nhỏ — 1 cột nullable |

**Chưa viết migration nào** trong Phase 0 này (đúng yêu cầu).

---

## 8. Security

| Hạng mục | crm-custom | zalo-crm-solar | Đánh giá |
|---|---|---|---|
| API Key OmiCall lưu ở đâu | `OMICALL_API_KEY` env, global (không theo org) | `config.omicallApiKey` env, global | Giống nhau — chưa multi-tenant, chấp nhận được vì hiện chỉ 1 công ty dùng |
| Access Token OmiCall | **Không dùng luồng `/api/auth`** — cả 2 module gọi thẳng bằng `x-api-key: <API_KEY thô>` | Giống hệt — `x-api-key` thẳng | Xem Unknown #1 — cần OmiCall xác nhận đây có đúng là cách dùng được hỗ trợ lâu dài không |
| SIP password nhân viên | ~~Plaintext~~ **[UPDATE 19/08] Đã mã hoá AES-256-GCM** (`ENCRYPTION_KEY` mới, port cùng thuật toán từ zalo-crm-solar) — mã hoá khi ghi (`upsertSipConfig`), giải mã khi trả cho admin xem/sửa hoặc chính user (SDK cần password gốc). Đã verify round-trip qua API thật. | AES-256-GCM (`config.encryptionKey`) | Ngang nhau sau khi sửa |
| Webhook nhận CDR — xác thực | Slug (8 hex) + secret riêng (SHA256 hash, so sánh tay không dùng `crypto.timingSafeEqual`) | Shared secret qua `?key=` hoặc header, so sánh — **cả 2 đều không phải HMAC ký payload**, vì OmiCall **không cung cấp cơ chế ký webhook** (xác nhận từ tài liệu, mục Webhooks) |
| Idempotency webhook | Có — upsert theo `externalId = call_uuid` | Có — `updateMany` theo `providerCallId` + fallback khớp theo cửa sổ ±2 phút cho record "pending" tạo trước khi gọi | Cả 2 đều hợp lý; cách zalo-crm-solar fallback theo thời gian có rủi ro khớp nhầm nếu 2 cuộc gọi trùng giờ — nên lưu ý |
| Logging | Không thấy bằng chứng redact số điện thoại/nội dung ghi âm trong log OmiCall — **chưa xác minh kỹ, cần audit riêng nếu cần tuân thủ bảo vệ dữ liệu khách hàng** | Tương tự | Cần xác minh thêm, không nằm trong phạm vi Phase 0 chi tiết này |
| RBAC | `api-keys`/`webhook-endpoints`/`cron-run` = SUPER_ADMIN only (đã xác nhận qua `@Roles`). `omicall` module không có RBAC (đúng vì máy-với-máy). `call-logs` scope theo role đọc. `users/:id/sip-config` = SUPER_ADMIN only (đã xác nhận) | Không dùng `requireGrant()` ở route telephony nào | **[UPDATE 19/08] Đã rà lại từng route sau khi đọc kỹ code — KHÔNG phải lỗ hổng thật:** `connect-config`/`sync` chỉ trả về/thao tác dữ liệu của **chính người gọi** (tự nhiên là self-service, không cần role cao hơn). `POST /calls` và `PATCH /calls/:id` đều có `where: { ownerUserId: current.id }` hoặc kiểm tra quyền hội thoại qua `checkZaloAccess`/`canSeeConversationContent` trước khi cho phép — không có IDOR. `GET /telephony/calls` (xem toàn org) dùng `role === 'owner' \|\| 'admin'` cứng thay vì `requireGrant()` — đây là **điểm không nhất quán về style**, không phải lỗ hổng (owner/admin vẫn là role hợp lệ, chỉ là không tận dụng được permission-group tuỳ biến sau này). **Quyết định: không sửa** — sửa theo hướng ban đầu đề xuất (gate `/sync` bằng role cao hơn) sẽ **làm gãy tính năng tự đồng bộ lịch sử của chính nhân viên sales**, vì endpoint này vốn thiết kế để self-service, không phải "quản trị". |

---

## 9. Webhook strategy

**Endpoint cần có:** đã có cả 2 nơi — không cần tạo mới nếu giữ nguyên kiến trúc 2 hệ song song.

**Event cần nhận:** theo tài liệu OmiCall chỉ xác nhận 3 event: `ringing`, `answered`, `hangup` (loại `call`); còn có loại `contact` nhưng **không có chi tiết payload** trong tài liệu được giao đọc.

**Idempotency:** OmiCall **không cung cấp event ID** trong tài liệu — cả 2 hệ tự chế cơ chế idempotency riêng (transaction_id/call_uuid làm khoá). Đây là lựa chọn đúng vì tài liệu xác nhận `transaction_id` tồn tại trong Call Transaction payload.

**Retry/error handling:** Tài liệu OmiCall **không nói gì về retry policy phía OmiCall** khi webhook của mình lỗi. `crm-custom` chủ động luôn trả HTTP 200 kể cả khi parse lỗi (đề phòng OmiCall tự retry vô hạn) — cách xử lý phòng thủ hợp lý cho case tài liệu không rõ. `zalo-crm-solar` không thấy pattern tương đương được xác nhận trong báo cáo.

**Mapping call → CRM customer/user:** cả 2 hệ đều match theo **số điện thoại + SIP user/extension**, không có ID khách hàng chung nào từ phía OmiCall để join trực tiếp — đây là điểm yếu cố hữu của tích hợp dựa trên số điện thoại (trùng số, số ảo, số đổi chủ).

---

## 10. WebSDK strategy

Theo tài liệu WebSDK v3 (trang overview gốc 404, đã đọc thay bằng trang tích hợp v3):

- **Click-to-call:** SDK hỗ trợ (`accept()/end()`, sự kiện `ringing/accepted`) — **[UPDATE] cả 2 hệ đều đã có UI đầy đủ.** `zalo-crm-solar`: `connect-config` + `TelephonySoftphone.vue`. `crm-custom`: `apps/web/src/providers/omicall-provider.tsx` (`OmiCallProvider`) — thực ra **chi tiết hơn** (popup cuộc gọi, tự tra cứu Lead/Customer + ghi chú gần nhất khi có cuộc gọi đến, kiểm tra quyền micro trước khi kết nối, ẩn UI mặc định của SDK). Bản audit gốc bỏ sót file này do tìm sai thư mục (`omicall`/`user-phones` module thay vì `users.service.ts` + `apps/web/src/providers/`).
- **Incoming call popup:** SDK bắn sự kiện `ringing`/`on_ringing` — implement UI popup là việc của CRM, không có sẵn trong SDK.
- **Call status:** có, qua các sự kiện `connecting/ringing/accepted/ended` + `rtcpStat` (chất lượng mạng).
- **Call recording:** tài liệu WebSDK **không nói rõ** cách trigger/lưu ghi âm qua SDK — việc ghi âm hiện tại ở `zalo-crm-solar` được lấy **sau khi cuộc gọi kết thúc**, qua Call Transaction API (`recording_file_url`), không qua WebSDK trực tiếp.
- **Agent extension configuration:** SDK cần `sipRealm/sipUser/sipPassword` — đây chính là bộ 3 field đã có sẵn ở cả 2 hệ (`UserSipConfig` / `User.omicallExtension*`), chỉ khác cách lưu (plaintext vs mã hoá).

**Quan hệ SDK ↔ REST API: KHÔNG được tài liệu xác nhận** — không rõ cuộc gọi qua WebSDK có tự động xuất hiện trong Call Transaction history (cùng `transaction_id`) hay không. Đây là Unknown quan trọng cần OmiCall xác nhận trước khi thiết kế đồng bộ 2 chiều.

---

## 11. Risks

1. ~~**Plaintext SIP password** (`crm-custom.UserSipConfig`)~~ **[FIXED 19/08]** — đã mã hoá AES-256-GCM, verify round-trip qua API thật.
2. **Xác thực webhook yếu** (shared secret, không phải HMAC) ở cả 2 hệ — do OmiCall không cung cấp cơ chế ký, nhưng nếu secret bị lộ (log, URL query string ở zalo-crm-solar dùng `?key=`) thì ai cũng giả mạo được CDR.
3. **`?key=` trong query string** (zalo-crm-solar) — dễ lọt vào access log của reverse proxy/CDN, rủi ro rò rỉ cao hơn header.
4. **Xung đột dữ liệu nếu chạy song song không đồng bộ** — nếu về sau quyết định cả 2 hệ cùng ghi nhận CDR của cùng 1 cuộc gọi thật, sẽ có 2 bản ghi độc lập (`CallLog` và `TelephonyCall`) không liên kết — rủi ro báo cáo sai số liệu nếu không làm rõ "nguồn sự thật".
5. **Base URL production chưa xác nhận** — cả tài liệu OmiCall lẫn `.env.example` của zalo-crm-solar đều trỏ về `public-v1-stg.omicall.com` (**staging**). Chưa rõ domain production thật.
6. ~~**RBAC lỏng ở telephony (zalo-crm-solar)**~~ **[REVISED 19/08]** — đã rà lại kỹ, không phải lỗ hổng thật (xem mục 8). Không dùng `requireGrant()` là đúng, vì các route đều tự nhiên self-service hoặc đã có ownership check riêng.
7. **Phụ thuộc số điện thoại làm khoá match** — không có ID khách hàng OmiCall để đối chiếu, dễ sai khi đổi SIM/số ảo.
8. **0 test cho phần OmiCall của `crm-custom`** — thay đổi trong tương lai dễ phá vỡ mà không phát hiện ngay.

---

## 12. Unknowns

Không suy đoán — liệt kê rõ để hỏi người phụ trách OmiCall hoặc xác nhận qua tài khoản thật:

1. ~~**Luồng `x-api-key` thẳng vs `/api/auth` access_token**~~ **[RESOLVED 19/08 — test trực tiếp bằng API key thật]:** Cả 2 cơ chế đều hoạt động thật, dùng cho 2 nhóm endpoint khác nhau — không mâu thuẫn: `x-api-key: <API key thô>` dùng được cho Call Transaction v3 (`omicall-history-sync.ts`, đã verify bằng cuộc gọi thật). Luồng `GET /api/auth?apiKey=` → `access_token` (Bearer) hoạt động thật và **cần thiết cho Call Center API** (`/api/call_center/internal_phone/list` — đã test, trả đúng `sip_user`/`password`/`domain` của 2 extension thật trên tài khoản). Kết luận: `x-api-key` cho Call Transaction/Contact API, Bearer access_token cho Call Center API — đúng như tài liệu mô tả cho từng nhóm, không phải tài liệu sai.
2. **Có cần hợp nhất 2 tích hợp OmiCall thành 1 hay để song song?** — đây là quyết định nghiệp vụ (nhân viên gọi từ đâu: giao diện CRM hay giao diện chat Zalo, hay cả hai), không phải quyết định kỹ thuật.
3. **Domain/base URL production thật của công ty trên OmiCall** — chưa xác nhận (cả 2 nơi hiện trỏ staging).
4. **Token access_token lifetime chính xác** — trang Authentication không ghi; trang Overview ghi "24 giờ" nhưng không rõ áp dụng cho endpoint nào.
5. **WebSDK có tự động ghi vào Call Transaction history không** (cùng transaction_id)? — không được tài liệu xác nhận.
6. **Payload chi tiết từng webhook event** (`ringing/answered/hangup`, và event loại `contact`) — tài liệu chỉ liệt kê tên, không có schema.
7. **Có signature/HMAC verification nào cho webhook không**, hay thực sự chỉ có shared-secret như code hiện đang giả định? Tài liệu không xác nhận có — cần hỏi thẳng OmiCall để chắc chắn không bỏ sót cơ chế bảo mật tốt hơn.
8. **`UserSipConfig` (crm-custom) có UI/API quản lý nào không** — model tồn tại nhưng agent khảo sát không tìm thấy service CRUD; cần xác minh lại (có thể nằm trong module khác chưa được rà).
9. **Chính sách retry của OmiCall khi endpoint webhook của mình lỗi/timeout** — không có trong tài liệu.

---

## 13. Recommended implementation phases

*(Chỉ đề xuất — chưa triển khai bất kỳ phase nào.)*

**Phase 1 — Xác nhận với OmiCall + chốt kiến trúc**
- Objective: giải quyết Unknown #1–#4, #7, #9 trực tiếp với OmiCall/người phụ trách tài khoản; chốt xem có hợp nhất 2 tích hợp hay giữ song song (Unknown #2).
- Affected files/modules: không có — thuần trao đổi + quyết định.
- Dependencies: quyền truy cập tài khoản OmiCall thật, người liên hệ kỹ thuật OmiCall.
- Acceptance criteria: có văn bản trả lời cho từng Unknown, có quyết định kiến trúc bằng văn bản.

**Phase 2 — Vá lỗ hổng bảo mật hiện có** ✅ **[DONE 19/08 — phần khả thi]**
- Đã làm: mã hoá `UserSipConfig.sipPassword` (crm-custom) — AES-256-GCM, file mới `apps/api/src/common/utils/aes-gcm.ts`, `ENCRYPTION_KEY` mới trong `.env`/`.env.example`/`.env.production`. Verify round-trip qua API thật (ghi ciphertext vào DB, đọc ra đúng plaintext cho admin form + self-service SDK).
- **Không làm** (đánh giá lại là rủi ro cao hơn lợi ích): chuyển `?key=` webhook (zalo-crm-solar) sang header-only. Lý do: code hiện chấp nhận CẢ query string LẪN header (`?key=` hoặc `x-webhook-key`) — không rõ OmiCall dashboard có cho cấu hình header tuỳ chỉnh khi đăng ký URL webhook hay không (không thể xác minh vì không tự đăng nhập dashboard thay bạn được). Nếu OmiCall chỉ hỗ trợ URL kèm query string (nhiều khả năng, dựa theo comment gốc trong code "Embedded as ?key=... in the webhook URL registered on the Omicall dashboard"), xoá nhánh query string sẽ làm **gãy hẳn webhook thật đang chạy**. Rủi ro thật (lộ secret qua access log reverse-proxy/CDN) vẫn còn, nhưng nên xử lý ở tầng hạ tầng (cấu hình không log query string) khi deploy thật, không phải xoá tính năng.

**Phase 3 — Đồng bộ 2 chiều CallLog ↔ TelephonyCall (chỉ nếu Phase 1 quyết định giữ song song)**
- Objective: mỗi cuộc gọi hoàn tất ở zalo-crm-solar tự động tạo/khớp 1 `CallLog` tương ứng ở crm-custom qua `webhook-endpoints` framework có sẵn.
- Affected files/modules: `webhook-endpoints` (crm-custom, đăng ký provider mới), `telephony` (zalo-crm-solar, thêm 1 lời gọi outbound sau khi cuộc gọi kết thúc).
- Dependencies: Phase 1, Phase 7 mục data model (field `sourceSystem` nếu cần).
- Acceptance criteria: 1 cuộc gọi thật tạo đúng 1 bản ghi hợp nhất, không trùng, xem được từ cả 2 UI.

**Phase 4 — Click-to-call trong crm-custom (nếu nghiệp vụ cần)**
- Objective: thêm WebSDK vào `apps/web` (Next.js) theo đúng pattern `connect-config` đã chứng minh hoạt động ở zalo-crm-solar.
- Affected files/modules: module mới phía frontend + 1 endpoint backend tương đương `connect-config`.
- Dependencies: Unknown #5 (WebSDK ↔ Call Transaction relation) cần trả lời trước để biết có cần đồng bộ ngược không.
- Acceptance criteria: nhân viên bấm gọi từ hồ sơ khách hàng trong crm-custom, cuộc gọi ghi nhận đúng vào `CallLog`.

**Phase 5 — Job đồng bộ định kỳ (thay vì chỉ chờ webhook)**
- Objective: cron nightly reconciliation gọi Call Transaction API để bù các cuộc gọi lỡ webhook.
- Affected files/modules: `cron-run` (crm-custom) hoặc `node-cron` mới (zalo-crm-solar).
- Dependencies: Phase 1.
- Acceptance criteria: chênh lệch số liệu giữa OmiCall dashboard và CRM sau 1 tuần chạy < ngưỡng chấp nhận được (cần thống nhất ngưỡng).

**Phase 6 — Test coverage cho phần OmiCall của crm-custom**
- Objective: viết test cho `omicall`, `call-logs` OmiCall-path theo template `lark-sync/__tests__/`.
- Affected files/modules: `apps/api/src/modules/omicall/__tests__/`, `apps/api/src/modules/call-logs/__tests__/`.
- Dependencies: không phụ thuộc phase khác, có thể làm song song bất cứ lúc nào.
- Acceptance criteria: coverage tương đương mức đã có ở zalo-crm-solar (6 file/424 dòng).

**Phase 7 — RBAC hoá route telephony (zalo-crm-solar)** ❌ **[HUỶ 19/08, sau khi rà lại kỹ]**
- Đã đọc lại toàn bộ route (`connect-config`, `resolve-conversation-target`, `sync`, `POST/PATCH /calls`) — tất cả đều tự self-scope đúng (theo `current.id` hoặc quyền hội thoại), không có IDOR. `/sync` là tự đồng bộ lịch sử **của chính mình**, không phải hành động quản trị — gate bằng role cao hơn sẽ làm gãy tính năng cho nhân viên sales thường. Không còn việc gì cần làm ở phase này.

---

## 14. Trạng thái triển khai (cập nhật 19/08, không còn "chưa triển khai")

**Recommended architecture:** Giữ 2 tích hợp OmiCall song song theo đúng vai trò hiện có (crm-custom = hồ sơ/CDR chính thức + AI summary; zalo-crm-solar = softphone/click-to-call gắn hội thoại Zalo), tái dùng framework webhook đã có ở crm-custom nếu cần nối 2 luồng lại, thay vì xây 1 kiến trúc hợp nhất mới từ đầu.

**Recommended first implementation task:** **Phase 2** (vá lỗ hổng SIP password plaintext ở crm-custom) — đây là việc duy nhất không phụ thuộc quyết định nghiệp vụ nào, có giá trị bảo mật rõ ràng, rủi ro thấp, và không đụng tới luồng OmiCall đang chạy thật.

**Questions requiring human confirmation trước khi làm bất cứ phase nào khác:**
1. Nhân viên sẽ gọi điện từ giao diện nào — CRM (`crm-custom`) hay chat Zalo (`zalo-crm-solar`) — hay cả hai? (quyết định nghiệp vụ, chi phối toàn bộ Phase 3–4)
2. Có cần "1 nguồn sự thật" duy nhất cho lịch sử cuộc gọi trên hồ sơ khách hàng, hay chấp nhận 2 hệ ghi nhận độc lập?
3. Domain/API base URL production thật trên OmiCall là gì (hiện code trỏ về staging)?
4. Có thể liên hệ ai bên OmiCall để xác nhận các Unknown #1, #4–#7, #9 ở mục 12?
