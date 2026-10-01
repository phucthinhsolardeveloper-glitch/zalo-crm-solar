# Production readiness audit

## Kết luận

**NOT READY FOR PRODUCTION** theo gate đầy đủ, dù instance production hiện healthy.

## P1 — Telephony RBAC cần xác minh production

- **Issue:** cần xác minh quyền `telephony` sau deploy trên dữ liệu nhóm quyền thực tế.
- **Evidence:** `permission-types.ts`, `PermissionGroupsView.vue`, `telephony-routes.ts`.
- **Root Cause:** telephony được bổ sung vào ma trận sau, nên phải kiểm tra seed/backfill và nhóm custom hiện hữu.
- **Risk:** cấu hình nhóm custom không có grant sẽ bị từ chối đúng nguyên tắc default-deny; không được tự suy quyền theo tên phòng ban.
- **Recommended Fix:** admin tick quyền `Tổng đài / Gọi điện` cho nhóm cần dùng; tạo nhóm riêng hoặc đổi nhóm user khi cần ngoại lệ.
- **Verification (2026-09-30):** đối chiếu trực tiếp DB production — org hiện chỉ có 2 user thật: `Admin User` (role `owner`, bypass toàn quyền) và `Ms Thảo` (role `member`, nhóm hệ thống `Trưởng phòng`, `grants.telephony={access,create,edit,view_all}`). Cả 2 nhóm/role đang dùng đều có quyền `telephony`; 7/7 nhóm hệ thống trong org đều `isSystem=true` (không có nhóm tùy chỉnh nào) nên rủi ro "nhóm custom bị default-deny" không áp dụng ở org này. Riêng 2 nhóm hệ thống `Marketing` và `Hành chính - Nhân sự` **cố ý không có key `telephony`** trong template (`permission-types.ts`) — đúng thiết kế (2 phòng ban này không cần gọi điện qua OmiCall), nhưng hiện chưa có user thật nào ở 2 nhóm đó nên chưa quan sát được tác động thật. **Cần xác nhận với chủ doanh nghiệp:** nếu sau này có nhân sự Marketing/HR cần dùng tính năng gọi điện, phải chủ động thêm `telephony` vào 2 template này hoặc gán user đó sang nhóm khác.
- **Status:** `VERIFIED PRODUCTION (2026-09-30)` — không phát hiện user nào bị khoá nhầm quyền gọi điện trên dữ liệu thật hiện tại. Đóng P1 với điều kiện: khi tuyển thêm user mới, phải kiểm tra nhóm quyền có `telephony` trước khi giao việc liên quan tổng đài.

## P1 — Recording hai phía chưa chứng minh

- **Issue:** legacy audit quan sát file mono; mono không tự chứng minh thiếu giọng nhưng acceptance hai phía chưa có.
- **Evidence:** archive final audit; code lưu nguyên recording provider trước mã hoá.
- **Root Cause:** provider recording mix/dual-leg config `UNKNOWN`.
- **Risk:** QA/compliance dựa vào file có thể thiếu nội dung.
- **Recommended Fix:** controlled call với câu định danh hai đầu, ffprobe/listen và provider config evidence.
- **Verification:** artifact + transcript/manual checklist hai phía.
- **Status:** `BLOCKED_EXTERNAL/NEEDS VERIFICATION`.

## P1 — Tenant hardening chưa enforce

- **Issue:** HTTPS/domain đã hoàn tất ngày 2026-09-29, nhưng CSP report-only; tenant guard off; RLS set-config false.
- **Evidence:** HTTPS/HSTS runtime response, runtime env snapshot và `tenant-rls.sql` header.
- **Root Cause:** staged rollout chưa hoàn tất.
- **Risk:** network exposure và thiếu DB defense-in-depth nếu application scope bug.
- **Recommended Fix:** guard warn clean; RLS staging; IDOR suite; CSP/tenant enforce theo rollout.
- **Verification (2026-09-30):** đã áp dụng `tenant-rls.sql` đầy đủ lên DB hiện tại — `rls_enabled_tables=92/92 policies=92` (trước đó chỉ 3/74). Đây là bước AN TOÀN đã xác nhận zero-behavior-change: `crmuser` đang là `superuser=true bypassrls=true` nên Postgres bỏ qua RLS bất kể enable/policy, đã verify `/health` vẫn `200` và `SELECT count(*) FROM contacts` vẫn trả 4002 y như trước khi áp policy.
- **Còn lại (cố ý CHƯA làm — cần cửa sổ staging riêng, không làm trực tiếp trên hệ thống đang chạy thật):** tạo role `DB_APP_USER` NOSUPERUSER/NOBYPASSRLS (`scripts/prepare-tenant-app-role.sh --apply`), chuyển app sang role đó, bật `RLS_SET_CONFIG=true` + `TENANT_GUARD_MODE=warn` rồi `enforce`, chạy negative cross-org suite trước khi enforce thật. `scripts/tenant-rls-preflight.sh` xác nhận đúng 3 điều kiện còn thiếu này (role/guard-mode/set-config), không còn cảnh báo về policy coverage.
- **Status:** `PARTIAL — policy coverage 100% (an toàn, đã verify), cutover sang role hạn chế + enforce vẫn NEEDS FIX (rủi ro cao, cần staging)`.

## P1 — DR mới xác minh phần PostgreSQL local

- **Issue:** PostgreSQL dump đã restore-test local, nhưng media/config/off-host và production-like app smoke chưa diễn tập.
- **Evidence:** `scripts/restore-postgres-test.sh` ngày 2026-09-30 restore thành công backup `backups/last/zalocrm-20260829-003833.sql.gz`; 114 bảng, contacts=3982, conversations=308, messages=34179; DB test tự dọn sau khi chạy.
- **Root Cause:** backup generation được vận hành trước restore/off-host design.
- **Risk:** backup không dùng được hoặc app khôi phục thiếu file/secret.
- **Recommended Fix:** backup media/config, checksum/off-host/alert và production-like app smoke.
- **Verification (2026-09-30):** `scripts/backup-full.sh` mới thêm — chạy thật thành công, tạo 1 set gồm `db.sql.gz` (10MB) + `media.tar.gz` (5.2GB, toàn bộ volume `file_storage`) + `config.tar.gz` (.env + docker-compose.yml, chmod 600) + `checksums.sha256` cho cả 3. Retention giữ N set mới nhất (mặc định 2, giống quy ước DB backup).
- **Còn thiếu:** off-host copy — script có nhánh `BACKUP_OFFHOST_DIR` nhưng **chưa có đích off-host thật** (biến chưa cấu hình) → toàn bộ backup vẫn nằm chung ổ đĩa với dữ liệu gốc, mất máy chủ là mất cả hai. Restore rehearsal mới test được nhánh DB (`restore-postgres-test.sh`); chưa restore-test nhánh media/config.
- **Status:** `PARTIAL — DB+media+config backup có checksum, off-host và full restore rehearsal vẫn NEEDS VERIFICATION`.

## P2 — Functional/test/performance gaps

- Status và tag dual system; dashboard placeholders; authenticated role E2E thiếu; frontend chunk lớn; capacity chưa benchmark.
- **CAPACITY NOT YET BENCHMARKED**. Cần k6/Artillery/browser scenario theo concurrent sale, chat/socket, DB pool, Redis queue, Zalo/OmiCall quota và media.

Chỉ chuyển `READY FOR PRODUCTION` khi P1 được đóng/accepted bằng văn bản, restore rehearsal và role E2E pass.
