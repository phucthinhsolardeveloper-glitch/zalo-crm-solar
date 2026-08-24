# Rollback

Code rollback: checkout commit/tag đã biết ổn định và rebuild `app`. Schema rollback không có automation; Prisma workflow là forward migration.

Nếu migration additive và code cũ tương thích, rollback image có thể đủ. Nếu schema/data đã biến đổi, restore DB staging/prod từ pre-deploy backup hoặc forward-fix. Không đoán.

## Gate

- xác định commit/image, migration boundary và data written sau deploy;
- backup/snapshot current state trước rollback;
- quyết định chấp nhận mất dữ liệu theo RPO;
- restore DB và media/config tương thích;
- verify migration status, health, login, core CRUD, integrations và worker.

Restore rehearsal production-like chưa được xác minh, vì vậy rollback readiness hiện `PARTIAL`.
