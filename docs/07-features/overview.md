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
