# Production runbook

## Preflight

1. `git status`, commit/branch/tag mục tiêu; diff env template và migration.
2. Kiểm disk/RAM, DB/Redis/backup health; tạo pre-deploy dump.
3. Test/typecheck/build ở staging/local phù hợp.
4. Review migration SQL và external provider change.

## Deploy

```bash
cd /root/zcrm
git pull
docker compose up -d --build app
docker exec zalo-crm-app npx prisma migrate deploy
docker compose restart app
```

Nếu service/compose thay đổi, target đúng service cần thiết. Sau deploy kiểm `docker compose ps`, `/health`, `prisma migrate status`, log error và smoke auth/contact/chat/call.

## Current gaps

Production dùng `http://<ip>:3080`, chưa domain/HTTPS. `STORAGE_DRIVER=local`; MinIO vẫn chạy. OmiCall/ZCC disabled ở snapshot; không suy ra integration production đã configured. Capacity chưa benchmark.
