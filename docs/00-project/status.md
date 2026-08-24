# Trạng thái project

## Kết luận

**NOT READY FOR PRODUCTION** theo tiêu chuẩn readiness của repository, dù instance production hiện đang chạy healthy.

## Snapshot đã xác minh 2026-08-24

- Production VPS `zalo-crm-pts`, branch `fix/omicall-sip-call-history`, commit `6c7e99c`.
- `app`, `db`, `redis`, `minio`, `clamav`, `backup` đều running/healthy.
- `/health`: application OK và database connected.
- Prisma: 119 migration, schema up to date.
- Runtime flags: `NODE_ENV=production`, local storage, antivirus enabled/fail-closed; `TENANT_GUARD_MODE=off`, `CSP_MODE=report-only`, `RLS_SET_CONFIG=false`; OmiCall/ZCC disabled ở snapshot này.
- Test local: backend 470/470, frontend 42/42; typecheck hai phía pass; Vite build pass.

## Blocker

- P1: chưa có resource/grant `telephony` trong RBAC matrix.
- P1: chưa chứng minh recording chứa đủ hai phía thoại; legacy audit quan sát file mono.
- P1: production chưa HTTPS/domain; CSP chỉ report-only; tenant guard/RLS chưa rollout.
- P1: backup chạy nhưng restore rehearsal chưa được thực hiện/xác minh.
- P2: chưa có E2E ổn định theo Sale/Manager/Admin và cross-tenant.
- P2: status legacy `Contact.status` và dynamic `statusId/Status` còn song song.
- P2: nhiều dashboard/report field trả số 0 placeholder trong `report-analytics-routes.ts`.
- P2: frontend có chunk `exceljs` khoảng 930 kB và CSS chính khoảng 812 kB.

Chi tiết issue/evidence/fix/verification: `docs/10-audits/production-readiness.md`.
