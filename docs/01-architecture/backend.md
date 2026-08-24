# Backend architecture and runtime guide

## Composition root

`backend/src/app.ts` bootstrap Fastify, plugins, Socket.IO, static files/SPA, domain routes, Zalo reconnect và in-process jobs; sau đó listen theo config. Project không có controller/repository layer bắt buộc: pattern thật thường là route function → preHandler → service/inline logic → Prisma/Zalo/Redis/storage → socket/webhook.

## Global Fastify behavior

- CORS production dùng configured app URL và credentials; dev cho origin linh hoạt.
- `@fastify/jwt` dùng access JWT secret.
- Global rate limit 1.200 API request/phút theo user JWT, fallback IP; static non-API allow-list.
- Multipart/formbody/static plugins; local storage có `/files/` nhưng recording namespace bị bảo vệ riêng.
- `trustProxy: true` cho edge/reverse proxy; proxy chain thật phải verify để IP/audit/rate limit đúng.
- Error handler log và trả `{error: message}`/status; không có một response schema toàn repo.
- `/health` chạy DB query; `/api/v1/status` trả API banner.
- Production SPA fallback phục vụ `index.html` cho URL không API.

## Domain routing và enforcement

Routes nằm trong `backend/src/modules/**/*routes.ts`, được register từ `app.ts` hoặc module. Auth/grant/scope có nhiều lớp: `authMiddleware`, `requireActiveUser`, `requireGrant`, `requireZaloAccess`, contact scope, privacy guards và public token/signature checks.

RBAC mới/grants và legacy role cùng tồn tại. Không suy route an toàn chỉ vì frontend ẩn. Với route mới phải xác định org scope, resource/action grant, Zalo account scope, record ownership, privacy redaction và audit.

Route catalog literal nằm ở `../04-api/route-catalog.md`; source vẫn là contract cuối vì catalog không bắt route động.

## Socket.IO

Backend đăng ký socket auth, Zalo/chat handlers và join room theo org. Producer chỉ emit vào room/scope đúng; payload không chứa credential/session. Reconnect phải có REST resync để tránh event gap. Event catalog đầy đủ hiện `NEEDS VERIFICATION`.

## Jobs và workers in-process

Sau listen, non-test runtime khởi động appointment reminder, Zalo health, contact intelligence, label sync, group-scan BullMQ worker, interaction/engagement/presence, friend/group/contact-profile sync, list enrichment, status checkpoint, scoring, auto-tag aggregate, media trash GC, event buffer, Telegram bridge và extension hook.

Zalo accounts có session, chưa archive và có UID được reconnect lúc boot. Extension `_ee` absent trong Community nên early/routes/jobs hooks degrade/no-op; Lead Pool/Facebook Ads artifacts trong schema/UI không chứng minh runtime Community có feature đó.

Một app process hiện gánh HTTP, Socket.IO, cron và worker. Scale ngang có thể duplicate scheduler/reconnect/listener nếu không có distributed ownership/lock. Capacity chưa benchmark.

## Persistence và external boundaries

Prisma singleton dùng adapter-pg và extensions cho normalized phone/name, null-byte strip, tenant guard và optional RLS. Production runtime flags hiện tenant guard off/RLS false, nên route/service scoping đặc biệt quan trọng.

Redis hỗ trợ queue/cache/event coordination. Zalo pool giữ provider sessions/connections. Storage driver local/R2/MinIO, ClamAV và encryption bảo vệ media/recording theo namespace. External calls cần timeout/retry/rate limit/idempotency riêng; không có một global integration policy tự động.

## Logging và errors

Fastify logger tắt; shared logger là owner. Docker json-file rotation 20 MB × 5. Log phải che access/refresh/session/SIP/storage/provider secret và customer content. Một số route tự validate/trả 400, Prisma/service error khác có thể thành 500; test error branch ở module đang đổi.

## Startup và shutdown

Boot phụ thuộc config validation, DB, route registration và listen; các integration có thể degrade tùy feature flag. SIGTERM/SIGINT hiện đóng group-scan worker và Fastify với timeout 10 giây. Drain đầy đủ mọi cron/worker/Zalo/Telegram/storage operation chưa được chứng minh: `NEEDS VERIFICATION`.

## Verification baseline

Backend ngày 2026-08-24: 62 test file/470 test pass; `npx tsc --noEmit` pass. Emit build local gặp `EPERM` khi ghi existing `backend/dist`, phân loại `ENVIRONMENT`; production cùng commit healthy nhưng không thay release-build evidence.

Thay backend phải chạy target test, typecheck, DB/integration smoke theo impact, rồi health/log. Auth/RBAC/data/telephony thay đổi cần negative, wrong-org/owner/Zalo scope, retry/concurrency và audit verification.
