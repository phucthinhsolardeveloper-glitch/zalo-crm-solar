# Migrations

Canonical schema: `backend/prisma/schema.prisma`; migration history: `backend/prisma/migrations/`. Production đã xác minh 119 migration up to date ngày 2026-08-24.

## Development

```bash
cd backend
npx prisma migrate dev --name <descriptive_name>
npx prisma generate
npx tsc --noEmit
npm test
```

Review generated SQL cho data loss, lock, backfill, unique/index và tenant scope. Migration có data transform phải có dry-run/query kiểm tra và backup.

## Production

Chỉ dùng `npx prisma migrate deploy`. Dockerfile cố ý không auto-migrate và đã loại `db push --accept-data-loss` khỏi startup.

Prisma không cung cấp automatic down migration trong workflow này. Rollback schema thực tế là image/code tương thích cộng restore backup hoặc forward-fix; phải diễn tập trước thay đổi phá vỡ.
