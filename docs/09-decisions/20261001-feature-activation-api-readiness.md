# Feature activation và API readiness

**Ngày:** 2026-10-01
**Trạng thái:** `READINESS / NOT READY FOR FULL PRODUCT ACTIVATION`
**Phạm vi:** branch `master01`, bản Community, nghiệm thu mặc định bằng Full Docker `http://localhost:3080`.

## Mục đích

Tài liệu này là checklist canonical trước khi bật thêm tính năng hoặc deploy
cho người dùng thật. Có source code, route hoặc menu **không đồng nghĩa** tính
năng đã hoạt động: phải có provider credential, route runtime, RBAC, test
negative/cross-org và smoke thực tế.

## Bằng chứng snapshot hiện tại

- Commit hiện tại: `087d0a30` — working tree sạch, branch đã push.
- Full Docker local: `/health` trả `200`, DB connected, Prisma schema up to date.
- Backend: `72/72` test file, `522/522` test pass; frontend: `5/5` file,
  `42/42` test pass; TypeScript và production build pass.
- Runtime log xác nhận **Community edition — `_ee` bundle absent**.
- AI provider key không có trong runtime local; gọi AI suggest đã ghi lỗi
  `AI provider key is not configured`.
- Các endpoint follow-up/automation của UI hiện không được Community register;
  probe runtime trả `404`.
- Local OmiCall đang bật cờ nhưng provider từng trả `401`; ZCC và CRM Custom
  relay chưa đủ cấu hình. Telegram bridge chưa có bot token.
- ClamAV container healthy nhưng đã quan sát timeout scan; do policy fail-closed,
  media có thể bị chặn khi timeout.

## Phân loại tính năng

| Nhóm | Trạng thái hiện tại | Điều kiện để gọi là hoạt động |
|---|---|---|
| Zalo chat/contact/friend/group | `IMPLEMENTED / NEEDS REAL ACCOUNT SMOKE` | Nick/session connected, test inbound/outbound, reconnect, scope org/account |
| Appointment, tag, scoring, customer list, group scan | `IMPLEMENTED / PARTIAL` | API + RBAC + browser smoke; metric/report phải có query thật |
| Broadcast cá nhân chia đợt | `IMPLEMENTED LOCAL / NEEDS REAL SEND ACCEPTANCE` | Nick test, contact test, batch/interval, pause/resume/cancel, quota và queue restart |
| AI suggestion, summary, sentiment | `CODE PRESENT / NOT ACTIVE` | Provider key hợp lệ, model, quota AI, privacy gate và test từng endpoint |
| AI chatbot/RAG | `CODE PRESENT / NOT ACTIVE` | OpenAI key cho embedding/chat, tài liệu `ready`, lịch chạy, opt-out và log |
| Follow-up/Automation | `NOT AVAILABLE IN COMMUNITY` | Phải đưa extension `_ee` vào image hoặc triển khai Community backend tương ứng |
| CRM Custom | `RELAY ONLY / NOT FULL SYNC` | Webhook CDR + secret + `call_uuid` idempotency; chưa có master-data sync hai chiều |
| Getfly CRM | `PLACEHOLDER` | Cần API contract thật; nút liên kết/đẩy dữ liệu hiện đang disabled |
| OmiCall | `PARTIAL / PROVIDER NOT VERIFIED` | API key/base URL hợp lệ, SIP/WebRTC, webhook, recording và audio hai chiều |
| Telegram bridge | `DISABLED` | Bot token, provisioning/link flow và test quyền/retry |
| Lead Pool/Facebook Ads/OA | `NOT MOUNTED OR NOT IMPLEMENTED` | Extension/provider chính thức, identity, queue, credential và recipient test |

## API inventory cần chuẩn bị

### 1. AI provider và RAG

Backend đã đăng ký các route sau dưới `/api/v1/ai`:

- `GET /providers` — danh sách provider và trạng thái key.
- `PUT /providers/:id` — lưu/xoá key và base URL theo organization; cần
  `settings:edit`.
- `GET /providers/:id/models` — kiểm tra provider và lấy model.
- `GET|PUT /config` — provider, model, quota ngày, bật/tắt AI.
- `GET /usage` — usage/quota.
- `POST /suggest` — draft trả lời theo conversation; cần privacy và quyền đọc.
- `POST /summarize/:conversationId` — tóm tắt hội thoại.
- `POST /sentiment/:conversationId` — phân tích cảm xúc.
- `GET|PUT /assistant-config` — Virtual Chat assistant, prompt và noise rule.
- `GET|PUT /chatbot/config` — bật chatbot Zalo, lịch, quota, similarity, top-K.
- `GET /chatbot/documents` — danh sách tài liệu knowledge.
- `POST /chatbot/documents` hoặc `POST /chatbot/documents/upload` — ingest tài liệu,
  tạo embedding.
- `DELETE /chatbot/documents/:id` — xoá tài liệu theo org.
- `GET /chatbot/logs` — audit/log chatbot.

**Credential/contract cần có:** API key theo organization hoặc env fallback,
base URL, model text, model embedding OpenAI, quota/cost, retention/provider
policy và test 401/429/5xx/timeout. Không bật chatbot chỉ vì UI cho phép bật.
Phải có ít nhất một tài liệu `ready`, test câu hỏi có/không có context và xác
nhận sale đã trả lời thì bot không chen vào.

### 2. Follow-up/Automation

UI hiện đang gọi các nhóm API sau nhưng bản Community hiện chưa có route runtime:

- `GET /api/v1/contacts/:contactId/automation-status`.
- `GET|POST|PUT|DELETE /api/v1/automation/rules` và `/rules/:id`.
- `GET|POST|PUT|DELETE /api/v1/automation/templates` và `/template-folders`.
- `POST /api/v1/automation/sequences/:id/preview`.
- `POST|DELETE /api/v1/automation/care-sessions/listen` và
  `GET /api/v1/automation/care-sessions/listening-pairs`/`listen-status`.
- `POST /api/v1/automation/triggers/:triggerId/contacts/:contactId/{advance,pause,stop,resume}`.

Để bật nhóm này cần chọn **một** hướng sở hữu, không dựng API giả song song:

1. Đóng gói và mount extension `_ee` có routes, worker, cron, sequence engine,
   RBAC và queue; hoặc
2. Chuyển một phạm vi tối thiểu vào Community, viết backend route/service/worker
   tương ứng và xoá/gate UI đang gọi endpoint không tồn tại.

**Gate bắt buộc:** state machine active/paused/stopped/completed, idempotency
per enrollment, pause khi khách trả lời, nick offline, restart worker, duplicate
job, cross-org denial và audit message source.

### 3. CRM Custom / Getfly

Hiện ZCRM chỉ có relay terminal CDR OmiCall tùy chọn tới CRM Custom:

- `POST` tới `CRM_CUSTOM_OMICALL_WEBHOOK_URL` với secret tương ứng.
- Payload dùng `call_uuid` làm idempotency key; relay là best-effort, không được
  làm call nội bộ thất bại.

Chưa có API hai chiều đã xác minh cho Lead/Customer/Order/Payment. Trước khi
triển khai cần chốt với repo `crm-custom` hoặc Getfly:

- endpoint/base URL và auth method;
- schema mapping Contact ↔ Lead/Customer và stable external ID;
- create/update/upsert, conflict rule và delete/opt-out;
- webhook inbound, signature, timestamp/replay protection;
- idempotency key, retry/backoff, dead-letter/replay và audit;
- field ownership: ZCRM giữ Contact/Friend/Conversation; CRM ngoài giữ
  Lead/Customer/Order/Payment.

Các nút “Liên kết CRM” và “Đẩy lên Getfly” chỉ được mở sau khi contract test
401/403/409/429/5xx, duplicate/out-of-order và cross-org pass.

### 4. OmiCall/ZCC

Các API nội bộ đã có nhưng chưa đủ bằng chứng provider:

- `GET /api/v1/telephony/omicall/connect-config`.
- `GET /api/v1/telephony/omicall/available-extensions`.
- `POST /api/v1/telephony/omicall/sync`.
- `GET /api/v1/telephony/calls`, `POST /api/v1/telephony/calls`,
  `PATCH /api/v1/telephony/calls/:id`.
- `GET|POST /api/v1/telephony/calls/:id/notes`.
- `GET /api/v1/telephony/calls/:id/recording`.
- `POST /api/v1/telephony/omicall/events` — webhook public, phải có secret.

Cần cấu hình và xác minh: `OMICALL_ENABLED`, `OMICALL_API_KEY`,
`OMICALL_API_BASE_URL`, domain/WSS/SIP, hotline/outbound mode, webhook secret,
per-user extension/password; ZCC cần thêm `OMICALL_ZCC_ENABLED` và SIP number.
Không gọi là live nếu provider trả 401, chưa test hai chiều audio, recording,
webhook duplicate và history reconciliation.

### 5. Telegram và provider khác

- Telegram bridge cần `TELEGRAM_BRIDGE_BOT_TOKEN`, provisioning credentials,
  link code, topic mapping và test reply hai chiều.
- Generic integrations có route CRUD cho `google_sheets`, `telegram`, `facebook`,
  `zapier`, nhưng credential/contract/runtime phải kiểm từng loại; Facebook
  trong Community vẫn phụ thuộc extension hook.
- Zalo OA/OA API cần provider chính thức, OA identity, OAuth/admin permission,
  template/recipient/quota, queue và sandbox recipient. Không dùng
  `channel='zalo_user'` để giả làm OA.

## Các màn hình đang là placeholder hoặc hidden

`SettingsComingSoon.vue` hiện còn các nhóm: notifications, theme, sessions,
billing, stuck rules, folders, templates, rate-limit page, automation,
public-token, feature-flags và backup/restore. Ngoài ra Community ẩn/không mount
Lead Pool, Facebook Ads, Pipeline report và Automation report vì `_ee` absent.

Các placeholder nghiệp vụ đang thấy trong chat:

- tab AI tổng hợp chưa nối thành trợ lý tương tác hoàn chỉnh;
- “Liên kết CRM”/“Đẩy lên Getfly” disabled;
- “Sản phẩm quan tâm” mới là vùng hiển thị, chưa có extractor/rule lưu dữ liệu.

### Marketing — parity với giao diện bản gốc/EE

Ảnh tham chiếu từ bản gốc cho thấy Marketing đầy đủ gồm: Mục tiêu, Phiên chăm
sóc, Luồng kịch bản, Khối nội dung, Mẫu tin nhắn, Gửi tin hàng loạt và Tệp
khách hàng. Đối chiếu source hiện tại:

- Community đã có màn `Marketing → Tệp khách hàng` với thống kê tổng tệp/Lead
  Ads/Paste-File/SĐT, tab Đang dùng/Lưu trữ/Tất cả, tìm kiếm, lọc nguồn, tạo
  tệp bằng paste/Excel/CSV/Lead Ads, kiểm tra trùng/hợp lệ/có Zalo, quét lại,
  lưu trữ, khôi phục và xoá.
- Community đã có `Gửi hàng loạt` cá nhân theo batch/thời gian; đây là luồng
  riêng của ZCRM, không phải toàn bộ Campaign/Sequence của EE.
- Các menu `Mục tiêu`, `Phiên chăm sóc`, `Luồng kịch bản`, `Khối nội dung` và
  `Mẫu tin nhắn` chưa được mount khi `_ee` bundle absent. Không mở menu giả hoặc
  coi route UI là tính năng hoạt động nếu backend/worker Community chưa có.
- Nút `Import CSV` trên header hiện đang disabled; import thật nằm trong modal
  `Tạo tệp` qua các tab Paste/Excel/CSV.
- Các nút nhanh `Tạo campaign từ tệp`, `Export CSV` và mũi tên mở tệp trong bảng
  đang có giao diện nhưng chưa có handler hoàn chỉnh; cần nối API/điều hướng và
  test trước khi quảng bá là chức năng đã hoạt động.
- Tệp Lead Ads hiện có schema/UI tạo tệp và `integrationKey`, nhưng việc lead
  tự chảy từ Facebook/TikTok/Google/Zalo cần extension/provider, webhook,
  identity, queue và worker; Community hiện chưa đủ điều kiện để gọi là live.

#### Backlog triển khai Marketing

1. Giữ màn `Tệp khách hàng` và broadcast cá nhân là scope Community hiện tại.
2. Nối `Export CSV` theo quyền/scope của tệp; test file, encoding, số dòng và
   không rò dữ liệu cross-org.
3. Nối `Tạo campaign từ tệp` vào luồng broadcast/sequence đã được chọn; không
   tạo thêm một queue/campaign owner song song.
4. Nối nút mở chi tiết và kiểm tra hành vi trên mobile, keyboard và RBAC.
5. Nếu cần giao diện giống ảnh đầy đủ, chọn một trong hai hướng: mount `_ee`
   có contract/worker thật, hoặc thiết kế Community-native cho từng module
   (Mục tiêu → Sequence → Blocks → Follow-up) với API, queue, idempotency,
   pause khi khách trả lời và audit log.

**Acceptance gate:** browser smoke trên Full Docker `:3080` cho tạo/import tệp,
lọc, archive/restore, rescan, export và chuyển tệp sang broadcast; test
anonymous/role không quyền/manager/admin, cross-org, duplicate job và worker
restart. Cho tới khi đạt gate, trạng thái các module EE là `NOT AVAILABLE IN
COMMUNITY`, còn các nút placeholder phải hiển thị rõ hoặc được ẩn.

## Thứ tự triển khai đề xuất

1. **Chốt edition/scope:** trước mắt chỉ coi Zalo core + broadcast + CRM nội bộ
   là scope Community; không mở menu Follow-up khi backend chưa có.
2. **Ổn định provider:** reconnect nick test; xử lý OmiCall 401 hoặc tắt cờ local;
   kiểm tra ClamAV timeout; xác nhận Telegram/OA có thật sự cần trong đợt này.
3. **AI:** cấu hình một provider staging, test suggest/summary/sentiment, sau đó
   ingest knowledge và test chatbot/RAG; ghi quota/cost/retention.
4. **Chốt CRM ngoài:** chọn CRM Custom hoặc Getfly, viết contract/idempotency test
   trước khi mở nút UI.
5. **Follow-up:** chỉ triển khai sau khi chọn `_ee` hoặc Community ownership; thêm
   route-level/API/E2E test và worker restart gate.
6. **Release:** backup DB + file/config, migration deploy, health, auth/RBAC,
   browser smoke và rollback point theo [production runbook](../06-operations/production.md).

## Release gate

Không tuyên bố tính năng đã triển khai nếu thiếu một trong các mục:

- route runtime tồn tại và trả lỗi cấu hình rõ ràng, không `404` do thiếu module;
- auth/RBAC, org scope, owner/account scope và privacy gate đã test;
- provider credential/contract test pass hoặc ghi `NEEDS VERIFICATION`;
- success, validation, duplicate, timeout, 401/403/429/5xx và restart queue pass;
- browser smoke trên Full Docker `:3080`;
- docs, rollback point, audit/observability và người chịu trách nhiệm đã chốt.

## Canonical references

- [Feature reality](../07-features/overview.md)
- [Business flows](../07-features/business-flows.md)
- [AI/integrations](../08-integrations/ai-webhooks-other.md)
- [CRM Custom boundary](../08-integrations/crm-custom-boundary.md)
- [OmiCall](../08-integrations/omicall.md)
- [Zalo safe operating model](20260929-zalo-safe-operating-model.md)
- [Production runbook](../06-operations/production.md)
