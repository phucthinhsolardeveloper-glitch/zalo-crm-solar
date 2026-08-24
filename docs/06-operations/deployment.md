# Deployment

## Pipeline repository

```text
developer → git push → VPS git pull → docker compose build/up
→ prisma migrate deploy → restart app → health/log smoke
```

Không có CI/CD workflow. `scripts/zalocrm-deploy.sh` hỗ trợ install/upgrade/backup, tạo `.env` khi thiếu, backup trước upgrade, build core services, migrate, revoke session cũ và health check.

Dockerfile multi-stage dùng Node 22 Alpine, build frontend/backend và chạy `node dist/app.js` qua tini. Migration không chạy tự động lúc container start.

## Production snapshot

VPS `zalo-crm-pts`, `/root/zcrm`, branch `fix/omicall-sip-call-history`, commit `6c7e99c`, xác minh 2026-08-24. Sáu service app/db/redis/minio/clamav/backup healthy. Đây là snapshot, phải kiểm lại trước deploy.

Không chạy deploy/migration khi chưa có backup kiểm tra non-zero và rollback decision. Không dùng `down -v`.
