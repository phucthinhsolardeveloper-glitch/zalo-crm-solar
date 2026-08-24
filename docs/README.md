# Tài liệu canonical ZCRM Solar

Kết quả reverse-audit về độ đầy đủ và các khoảng trống còn thật nằm tại `10-audits/documentation-completeness-review.md`.

Tài liệu này mô tả trạng thái đã xác minh của working tree/production, không phải cam kết sản phẩm. Dữ liệu runtime có timestamp; khi quá hạn phải xác minh lại.

## Bản đồ

- `00-project/`: mục tiêu, trạng thái, glossary.
- `01-architecture/`: boundary, component, frontend/backend, request/data/dependency flow.
- `02-development/`: local setup, command, environment, workflow, testing và Git runbook chi tiết.
- `03-data/`: PostgreSQL/Prisma, data model, migration, backup/restore, safety.
- `04-api/`: API conventions, authentication, integration boundary và route catalog từ Fastify source.
- `05-security/`: security model, auth/RBAC, secrets, checklist.
- `06-operations/`: deploy, production snapshot, monitoring, incident, rollback.
- `07-features/`: feature reality, ownership và business flows end-to-end.
- `08-integrations/`: Zalo, OmiCall, Telegram, storage, AI và các provider khác.
- `09-decisions/`: ADR/index quyết định.
- `10-audits/`: current-state, production readiness và đối chiếu đầy đủ legacy→canonical.
- `11-workflows/`: development/debug/release/documentation.
- `12-ai/`: context map, agent workflow, task/prompt standard.
- `13-handoffs/`: continuation artifact tạm thời.
- `CHANGELOG.md`, `ROADMAP.md`: thay đổi tài liệu và việc còn lại.

Legacy đã đóng băng tại `../_archive/legacy-docs/2026-08-24/`. Không sửa archive để phản ánh hiện tại; tạo/cập nhật canonical doc thay thế.

Để kiểm một tài liệu cũ đã được giữ và chuyển tri thức đi đâu, dùng `10-audits/legacy-crosswalk.md` và `../_archive/legacy-docs/2026-08-24/LEGACY-INVENTORY.md`.

## Quy ước xác minh

- `VERIFIED_CURRENT`: khớp code/config/test/runtime hiện tại.
- `VERIFIED_PARTIAL`: một phần có bằng chứng, phần còn lại chưa đủ.
- `DOCUMENTED_ONLY`: có runbook/claim nhưng chưa quan sát runtime.
- `UNKNOWN` / `NEEDS VERIFICATION`: chưa đủ bằng chứng.

Ngày tái dựng: 2026-08-24, branch `fix/omicall-sip-call-history`, HEAD `6c7e99c`; working tree có một thay đổi comment của user trong `telephony-routes.ts`.
