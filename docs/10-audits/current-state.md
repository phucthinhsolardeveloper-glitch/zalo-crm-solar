# Current-state audit — 2026-08-24

## Scope/evidence

Đã inspect source frontend/backend, manifests/lock, Prisma schema/migrations, compose/Dockerfile, scripts, env template, route registration, tests và legacy docs. Runtime production được đọc trực tiếp qua SSH: commit/container/migration/health/backup flags, không mutation.

## Classification

- `WORKING`: production health/migration, auth/refresh, core Zalo/CRM, Socket.IO, DB/Redis, backup generation, local tests.
- `PARTIAL`: RBAC dual model, Status/Tag cutover, analytics, backup/restore, monitoring, telephony.
- `MISSING`: CI/CD, stable browser E2E, capacity benchmark, telephony grant, central observability.
- `DUPLICATED`: contact detail/edit, status, tags, role/grants.
- `DEPRECATED`: runtime status migration trả 410; API docs token 7 ngày đã archive.
- `UNKNOWN`: provider SLA/rate limit, current active user load, off-host backup, restore RTO/RPO.

## Verification result

Backend 470/470 test pass; frontend 42/42; both typecheck pass; Vite build pass. Backend emit build local gặp `EPERM` khi ghi `backend/dist` (`ENVIRONMENT`), production image cùng commit đang healthy.

Working tree trước reconstruction có một comment-only edit của user ở `telephony-routes.ts`; đã giữ nguyên.
