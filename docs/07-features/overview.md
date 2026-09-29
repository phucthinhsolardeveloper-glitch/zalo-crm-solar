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

## Trạng thái kích hoạt thật trên production (xác minh 2026-09-29 qua SSH runtime + DB)

"Có trong code" không đồng nghĩa "đang bật". Trạng thái thật trên VPS `pts-prod-01`:

| Tính năng | Code | Bật trên production? | Ghi chú |
|---|---|---|---|
| Auth/RBAC/Contact CRM | Có | **Chờ setup owner** | App healthy; `/api/v1/setup/status` trả `needsSetup=true`. |
| Zalo cá nhân (chat/friend/group qua `zca-js`) | Có | **Chưa cấu hình** | Database production mới, chưa có account/session Zalo. |
| Zalo OA (Official Account) | Có (bảng `zalo_oa_connections`/`zalo_oa_app_configs`) | **Chưa cấu hình** | Database production mới. |
| OmiCall (softphone/call history/recording) | Có | **Tắt** (`OMICALL_ENABLED=false`) | Trial key không được dùng trên production; chờ key thật và đóng blocker P1. |
| OmiCall ZCC | Có | **Tắt** (`OMICALL_ZCC_ENABLED=false`) | SIP number cũng chưa cấu hình. |
| Telegram bridge | Có | **Chưa cấu hình** | `TELEGRAM_BRIDGE_BOT_TOKEN`/`TELEGRAM_PROVISIONER_API_ID` rỗng trong `.env`. |
| AI chatbot/suggestion | Có, resolve key theo org → legacy plain → env fallback (`ai-service.ts:41-44`) | **Chưa cấu hình key nào** | `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` đều rỗng trong `.env`; chưa có org nào set key riêng qua UI. Gọi tính năng này hiện sẽ trả lỗi rõ ràng "Chưa cấu hình OpenAI API key" (không crash, nhưng không dùng được). |
| Tenant guard / RLS | Có | **Tắt** (`TENANT_GUARD_MODE=off`, `RLS_SET_CONFIG=false`) | Xem `10-audits/production-readiness.md`. |
| CSP enforce | Có | **Report-only** (`CSP_MODE=report-only`) | Chưa chặn thật. |

**Bối cảnh quan trọng:** DB production mới hiện có **0 user** và chưa có dữ liệu nghiệp vụ; owner đầu tiên chưa hoàn tất initial setup. Đây là môi trường pre-launch, chưa phải production đang phục vụ người dùng kinh doanh thật.
