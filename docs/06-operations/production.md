# Production runbook

## Preflight

1. `git status`, commit/branch/tag mục tiêu; diff env template và migration.
2. Kiểm disk/RAM, DB/Redis/backup health; tạo pre-deploy dump.
3. Test/typecheck/build ở staging/local phù hợp.
4. Review migration SQL và external provider change.

## Deploy

```bash
cd /srv/zcrm
git pull --ff-only origin master01
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build app
docker exec zalo-crm-app npx prisma migrate deploy
docker compose -f docker-compose.yml -f docker-compose.vps.yml restart app
```

Nếu service/compose thay đổi, target đúng service cần thiết. Sau deploy kiểm `docker compose ps`, `/health`, `prisma migrate status`, log error và smoke auth/contact/chat/call.

## Current gaps

Production dùng `https://zcrm.phucthinhsolar.com` qua Caddy ở stack
`/srv/phucthinhsolar`. `STORAGE_DRIVER=local`; MinIO không chạy trong profile mặc
định. OmiCall/ZCC disabled; database mới đang chờ tạo owner đầu tiên. CSP vẫn
report-only, tenant guard/RLS chưa rollout và capacity chưa benchmark.
