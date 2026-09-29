# Deployment

## Pipeline repository

```text
developer → git push → VPS git pull → docker compose build/up
→ prisma migrate deploy → restart app → health/log smoke
```

Không có CI/CD workflow. `scripts/zalocrm-deploy.sh` hỗ trợ install/upgrade/backup, tạo `.env` khi thiếu, backup trước upgrade, build core services, migrate, revoke session cũ và health check.

Dockerfile multi-stage dùng Node 22 Alpine, build frontend/backend và chạy `node dist/app.js` qua tini. Migration không chạy tự động lúc container start.

## Production snapshot

Xác minh 2026-09-29: VPS `pts-prod-01` (`222.255.182.182`), source
`/srv/zcrm`, branch `master01`, domain `https://zcrm.phucthinhsolar.com`.
App/db/Redis/ClamAV/backup healthy; Caddy nằm ở stack `/srv/phucthinhsolar`
và route tới app qua external network `phucthinhsolar_edge`.

VPS có override server-local `/srv/zcrm/docker-compose.vps.yml`: app không publish
host port, tham gia Caddy edge network, dependency MinIO được bỏ khi
`STORAGE_DRIVER=local`, còn MinIO/minio-init nằm trong profile `object-storage`.
Không commit `.env` production hoặc sao chép secret về workstation.

Không chạy deploy/migration khi chưa có backup kiểm tra non-zero và rollback decision. Không dùng `down -v`.
