# Development workflow

## Inspect và ownership

Đọc `AGENTS.md`, context map, status và domain doc; kiểm `git status` để bảo vệ thay đổi người dùng. Trace UI → API/middleware → service → Prisma/Redis/storage/provider. Trước implement phải trả lời: behavior đã tồn tại chưa, module nào sở hữu, reuse được gì và có tạo duplicate ownership không.

ZCRM sở hữu Zalo/chat/contact aggregation/telephony orchestration. Lead/Customer/Order/Payment thuộc `crm-custom`; thay đổi cross-system phải định nghĩa contract thay vì sao chép domain.

## Plan và implement

Ghi acceptance, negative paths, compatibility và rollback. Dùng owner module/abstraction hiện có, giữ diff nhỏ, không lộ secret/PII và không tự đổi production. Với:

- schema: migration additive, constraint/index, backfill, backup và deploy ordering;
- auth/RBAC: anonymous, role, org, owner/assignment và audit log;
- Zalo/OmiCall: duplicate/out-of-order, reconnect, quota/429, timeout và idempotency;
- media/storage: MIME/size/AV, private/public boundary, retention và failure cleanup;
- cross-CRM: event identity, auth secret, retry/reconciliation và partial failure.

## Verification ladder

Chạy test liên quan, backend `npx tsc --noEmit`, frontend `npx vue-tsc --noEmit`, production build, rồi DB/API/browser/provider smoke theo phạm vi. Build không thay thế integration/security test. Phân loại failure `PRE_EXISTING`, `REGRESSION`, `ENVIRONMENT`, `REAL_BUG` hoặc `UNKNOWN`.

## Hoàn tất

Review diff, cập nhật canonical docs/changelog nếu contract hoặc behavior đổi, ghi test đã/chưa chạy và known issue. Không commit, push, deploy, migrate production hay thay secret/DNS/firewall nếu người dùng chưa yêu cầu.
