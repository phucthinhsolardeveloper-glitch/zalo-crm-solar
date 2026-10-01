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

## Runtime local chuẩn

- Runtime nghiệm thu local của repository này là Full Docker tại
  `http://localhost:${APP_PORT:-3080}`. Đây là nguồn bằng chứng browser/runtime
  mặc định khi user nói đang kiểm tra "local".
- Vite (`:5173` hoặc port tạm khác) là chế độ Hybrid riêng, không phải bản đang
  chạy trong container. Không chạy lẫn hai chế độ trong cùng một phiên nghiệm
  thu và không kết luận lỗi đã sửa chỉ từ Vite, mock API hoặc `frontend/dist`.
- Docker image là snapshot tại thời điểm build; sửa source không tự cập nhật
  container. Sau thay đổi UI phải rebuild/sync runtime được user mở, hard-refresh
  nếu cần, rồi kiểm tra lại chính URL `:3080` trước khi báo hoàn tất.
- Nếu buộc dùng Vite để chẩn đoán, phải ghi rõ đây là kiểm tra cô lập và vẫn để
  trạng thái `NEEDS VERIFICATION` cho tới khi Full Docker được verify.

## Tài liệu là một phần implementation

Thay đổi architecture, schema, API, auth/RBAC, environment, deployment, integration, operational behavior hoặc user-visible behavior phải cập nhật canonical docs tương ứng. Mỗi fact có một canonical home; các file khác link tới đó thay vì copy dài.

Đọc [docs/12-ai/context-map.md](docs/12-ai/context-map.md) để nạp minimum sufficient context. Handoff tạm đặt trong `docs/13-handoffs/`; kiến thức còn giá trị phải chuyển về canonical docs.

## Quy tắc phối hợp và bảo trì vận hành

- Phân loại thay đổi trước khi chạy: `docs-only`, frontend rủi ro thấp,
  backend/API, data/migration, security/infrastructure. Chọn mức kiểm tra/deploy
  nhỏ nhất phù hợp; không chạy quy trình nặng cho thay đổi nhỏ, nhưng không dùng
  đường nhanh để né test dữ liệu hoặc bảo mật.
- Tác vụ dài phải có checkpoint và log; nếu timeout là giới hạn công cụ thì giữ
  process/artifact để theo dõi, không lặp lại cùng lệnh khi chưa có chẩn đoán mới.
- Bảo trì disk/Docker bắt đầu bằng `df -h`, `du -x` và `docker system df -v`.
  Chỉ prune cache/image không dùng sau khi xác định current/previous/rollback;
  không xóa volume database, upload, secrets hoặc state reference.
- Comment source chỉ ghi rationale kỹ thuật, invariant và giới hạn; không ghi lời
  hội thoại, tên AI hoặc trích dẫn người dùng.
- Sau milestone lớn, migration, thay đổi kiến trúc/API/deployment hoặc đợt bảo trì
  phải rà soát canonical docs và ghi lịch sử; không cần ghi real-time cho mọi thay
  đổi nhỏ.
- Báo cáo bằng tiếng Việt, nêu evidence, test đã/chưa chạy, unknown, rủi ro,
  rollback point và blocker production.
