# Database

PostgreSQL 16 là persistent source; Prisma 7 + `@prisma/adapter-pg` là data access chính. Schema hiện có 113 model, 2 enum và 119 migration.

Compose đặt DB timezone UTC để timestamp nghiệp vụ không lệch khi Prisma đọc; OS/log timezone Asia/Ho_Chi_Minh. `max_connections=50`, `shared_buffers=128MB`, `effective_cache_size=256MB` là cấu hình compose hiện tại, không phải benchmark capacity.

## Multi-tenant

`Organization` là root; phần lớn business table có `org_id`. App dùng AsyncLocalStorage tenant context và query scope thủ công/helper. Tenant guard có `off|warn|enforce`; production snapshot là `off`.

`backend/prisma/rls/tenant-rls.sql` tạo policy động cho mọi bảng thật trong target database có cột `org_id`, tránh danh sách tĩnh lệch migration. Local hiện chỉ có 3 bảng AI và 3 policy RLS đang bật; role `crmuser` vẫn là superuser/bypass-RLS nên đây chưa phải database-level tenant protection. Production/staging phải chạy `scripts/prepare-tenant-app-role.sh --apply`, đổi app sang `DB_APP_USER`, chạy `scripts/tenant-rls-preflight.sh`, dùng runtime role `NOSUPERUSER NOBYPASSRLS`, rồi mới bật `TENANT_GUARD_MODE`/`RLS_SET_CONFIG` và apply đủ policy.

## Transaction/constraint

Schema có FK/cascade/set-null, unique/index cho identity, owner/provider call ID và timeline. Một số service dùng `$transaction`; không có bằng chứng mọi multi-write workflow đều atomic. Review theo từng flow.
