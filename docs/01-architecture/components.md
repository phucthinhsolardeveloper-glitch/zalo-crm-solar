# Components và ownership

## Frontend

`frontend/src/main.ts` bootstrap Vue/Pinia/router/Vuetify. `src/router/index.ts` định nghĩa route/guard. `src/api/` sở hữu Axios/Socket.IO transport; `stores/` giữ auth/RBAC/privacy; `views/`, `components/`, `composables/` triển khai feature UI.

Hướng dẫn chi tiết route/state/API/realtime/form/build nằm ở [frontend.md](frontend.md).

## Backend

`backend/src/app.ts` là composition root: config, Fastify plugins, Socket.IO, routes, background jobs và graceful shutdown. Domain modules nằm trong `src/modules/*`; shared infrastructure nằm trong `src/shared/*`.

Process model, plugins, jobs, startup/shutdown và verification nằm ở [backend.md](backend.md).

Ownership tiêu biểu:

- auth/session: `modules/auth`;
- grant/scope: `modules/rbac`, `modules/zalo/zalo-access-*`, contact scope helpers;
- Zalo lifecycle/realtime: `modules/zalo`, chat listener/handlers;
- CRM data: `modules/contacts`, `lists`, `tags`, `scoring`, `engagement`;
- telephony: `modules/telephony`;
- media/storage/security: `modules/media`, `shared/storage`, `shared/security`;
- integration: `modules/integrations`, `modules/ai`.

## Data/infra

PostgreSQL schema có 113 model/2 enum và 119 migration. Redis chạy AOF `everysec`, noeviction, 256 MB trong compose. Compose còn có MinIO, ClamAV và daily PostgreSQL backup.

## Duplication cần quản lý

- `Contact.status` và `statusId/Status` là hai nguồn trạng thái chưa cutover.
- RBAC mới và legacy role cùng tồn tại.
- Mobile/desktop contact detail có nhiều implementation.
- Schema extension còn hiện diện dù `_ee` runtime vắng mặt.
