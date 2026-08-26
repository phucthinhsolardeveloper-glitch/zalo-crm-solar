# Feature reality

Luồng end-to-end cho auth, Contact, chat, friend/group/tag, appointment, media, OmiCall, privacy, Telegram và reporting nằm ở [business flows](business-flows.md). File này giữ bảng trạng thái tổng hợp.

## Working/implemented

Auth/session, organization/user, Zalo account/chat/friend/group, Contact CRM, appointments, tags, scoring/engagement, media, notifications, search, customer lists, reports cơ bản, OmiCall softphone/history/recording, Telegram bridge, AI suggestion/RAG.

## Partial/duplicated

- Status legacy/dynamic; tag taxonomy legacy/v2; role legacy/grants.
- Dashboard/report analytics có nhiều placeholder zero/TODO.
- Mobile/desktop contact detail và edit path trùng.
- Extension schema/feature artifacts tồn tại nhưng Community `_ee` absent.

## Missing/unknown

Telephony grant resource, stable role-based E2E, capacity benchmark, provider SLA/rate limits, fully verified DR. Feature status chi tiết phải theo code/test của module, không theo marketing README legacy.

## Trạng thái kích hoạt thật trên production (xác minh 2026-08-24 qua SSH `.env` + DB)

"Có trong code" không đồng nghĩa "đang bật". Trạng thái thật trên VPS `zalo-crm-pts`:

| Tính năng | Code | Bật trên production? | Ghi chú |
|---|---|---|---|
| Auth/RBAC/Contact CRM | Có | **Bật** | Đang chạy, 401 khi chưa auth đã xác minh. |
| Zalo cá nhân (chat/friend/group qua `zca-js`) | Có | **KHÔNG hoạt động** | Chỉ có 1 `zalo_accounts` row, `status='disconnected'`, chưa từng connect thật. Log cron xác nhận `"No connected accounts, nothing to sync"`. |
| Zalo OA (Official Account) | Có (bảng `zalo_oa_connections`/`zalo_oa_app_configs`) | **Chưa dùng** | 0 row trong `zalo_oa_connections`. |
| OmiCall (softphone/call history/recording) | Có, API key + webhook secret đã set trong `.env` | **Tắt** (`OMICALL_ENABLED=false`) | Chờ đóng blocker P1 (RBAC telephony, xác minh recording 2 chiều) trước khi bật — xem `10-audits/production-readiness.md`. |
| OmiCall ZCC | Có | **Tắt** (`OMICALL_ZCC_ENABLED=false`) | SIP number cũng chưa cấu hình. |
| Telegram bridge | Có | **Chưa cấu hình** | `TELEGRAM_BRIDGE_BOT_TOKEN`/`TELEGRAM_PROVISIONER_API_ID` rỗng trong `.env`. |
| AI chatbot/suggestion | Có, resolve key theo org → legacy plain → env fallback (`ai-service.ts:41-44`) | **Chưa cấu hình key nào** | `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` đều rỗng trong `.env`; chưa có org nào set key riêng qua UI. Gọi tính năng này hiện sẽ trả lỗi rõ ràng "Chưa cấu hình OpenAI API key" (không crash, nhưng không dùng được). |
| Tenant guard / RLS | Có | **Tắt** (`TENANT_GUARD_MODE=off`, `RLS_SET_CONFIG=false`) | Xem `10-audits/production-readiness.md`. |
| CSP enforce | Có | **Report-only** (`CSP_MODE=report-only`) | Chưa chặn thật. |

**Bối cảnh quan trọng:** DB production hiện chỉ có **1 user** (tài khoản chủ, tạo 2026-08-22), **0 contact/conversation/message/call/campaign**. Đây là môi trường đã deploy đúng nghĩa "production" (infra thật, domain/IP thật) nhưng **chưa có dữ liệu/người dùng kinh doanh thật** — tức là đang ở giai đoạn pre-launch/pilot, chưa phải "production đang phục vụ khách hàng thật". Cần làm rõ điều này trước khi đánh giá mức độ khẩn cấp của các blocker P0/P1 khác.
