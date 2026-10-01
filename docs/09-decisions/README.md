# Architecture decisions

Không có ADR formal đã được xác minh trước đợt reconstruction. Quyết định hiện được suy ra từ code/migration/comment và legacy docs; canonical facts nằm ở domain docs.

Các quyết định cần ADR tiếp theo:

1. Ownership giữa ZCRM channel và `crm-custom` business ledger.
2. Telephony RBAC action matrix.
3. Status/tag/legacy role cutover.
4. Tenant RLS rollout.
5. Storage public/private boundary và off-host DR.

Quyết định đã ghi nhận:

- [Mô hình vận hành Zalo an toàn và lộ trình triển khai 2026-09-29](20260929-zalo-safe-operating-model.md): tách Zalo cá nhân/OA, policy gate, queue, credential và tenant hardening.

ADR mới nên ghi context, decision, alternatives, consequences, migration và verification; không dùng ADR để mô tả state tạm thời.
