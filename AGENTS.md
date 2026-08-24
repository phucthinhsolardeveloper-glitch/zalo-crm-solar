# Shared AI Operating Contract

File này là hợp đồng vận hành chung cho Codex, Claude Code và AI agent khác trong repository.

## Ngôn ngữ giao tiếp

Regardless of the language of the task prompt, all user-facing progress reports, findings, warnings, completion summaries, and recommendations must be written in Vietnamese. Giữ nguyên identifier kỹ thuật, path, command và error message khi cần trích dẫn chính xác.

## Quy tắc bằng chứng

- Không bịa. Nếu chưa xác minh, ghi `UNKNOWN` hoặc `NEEDS VERIFICATION`.
- Ưu tiên: runtime quan sát được → test chạy được → code hiện tại → schema/migration → config/infra → canonical docs → legacy archive → comment/giả định.
- Không đọc hoặc đưa giá trị secret từ `.env` vào chat, log hay tài liệu.
- Tài liệu legacy trong `_archive/` là bằng chứng lịch sử, không phải source of truth hiện tại.

## Vòng lặp bắt buộc

```text
INSPECT → UNDERSTAND → PLAN → IMPLEMENT → TEST → DEBUG → VERIFY → DOCUMENT → REPORT
```

Task đơn giản có thể plan ngắn. Task executable không được dừng ở plan nếu còn bước an toàn trong phạm vi có thể thực hiện.

Trước khi implement, trả lời:

```text
Does this already exist?
Who owns this?
Can existing implementation be reused?
Could this create duplicate ownership?
```

## An toàn repository và dữ liệu

- Kiểm tra `git status` trước khi sửa; thay đổi chưa commit thuộc người dùng. Không overwrite/revert nếu không được yêu cầu.
- Không dùng `docker compose down -v`, `prisma db push --accept-data-loss`, `prisma migrate reset`, `git reset --hard` hoặc xoá volume/data production.
- Schema production chỉ dùng migration đã review và `prisma migrate deploy`; backup trước deploy/migration.
- Không coi backup là hoàn chỉnh nếu chưa restore rehearsal và kiểm tra dữ liệu.
- Không tự thay đổi runtime production, secret, DNS, firewall hoặc dữ liệu thật khi user chỉ yêu cầu audit/giải thích.

## Verification theo phạm vi

- Frontend: test liên quan → `npx vue-tsc --noEmit` → `npm run build` → browser/E2E nếu luồng UI thay đổi.
- Backend: test liên quan → `npx tsc --noEmit` → integration/DB test khi cần → API/runtime smoke.
- Schema: review SQL migration, constraint/index, tính tương thích dữ liệu, backup/rollback và `prisma migrate status`.
- Security/auth/RBAC: test cả anonymous, user không quyền, user có quyền, cross-org/cross-owner và audit log.
- Deployment: build image, migrate deploy, `/health`, container/log, backup và rollback plan.

Không tuyên bố thành công chỉ dựa vào build. Phân loại failure: `PRE_EXISTING`, `REGRESSION`, `ENVIRONMENT`, `REAL_BUG`, `UNKNOWN`.

## Tài liệu là một phần implementation

Thay đổi architecture, schema, API, auth/RBAC, environment, deployment, integration, operational behavior hoặc user-visible behavior phải cập nhật canonical docs tương ứng. Mỗi fact có một canonical home; các file khác link tới đó thay vì copy dài.

Đọc [docs/12-ai/context-map.md](docs/12-ai/context-map.md) để nạp minimum sufficient context. Handoff tạm đặt trong `docs/13-handoffs/`; kiến thức còn giá trị phải chuyển về canonical docs.
