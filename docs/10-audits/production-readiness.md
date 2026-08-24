# Production readiness audit

## Kết luận

**NOT READY FOR PRODUCTION** theo gate đầy đủ, dù instance production hiện healthy.

## P1 — Telephony RBAC thiếu

- **Issue:** permission resources không có `telephony`.
- **Evidence:** `permission-types.ts`; telephony routes dùng auth/active-user/scope riêng.
- **Root Cause:** telephony thêm sau matrix RBAC.
- **Risk:** không quản trị độc lập quyền gọi/history/recording; role regression khó thấy.
- **Recommended Fix:** thêm resource/actions, migration default grant, backend+UI guard.
- **Verification:** role matrix Sale/Leader/Admin, API negative/cross-owner và browser.
- **Status:** `NEEDS FIX`.

## P1 — Recording hai phía chưa chứng minh

- **Issue:** legacy audit quan sát file mono; mono không tự chứng minh thiếu giọng nhưng acceptance hai phía chưa có.
- **Evidence:** archive final audit; code lưu nguyên recording provider trước mã hoá.
- **Root Cause:** provider recording mix/dual-leg config `UNKNOWN`.
- **Risk:** QA/compliance dựa vào file có thể thiếu nội dung.
- **Recommended Fix:** controlled call với câu định danh hai đầu, ffprobe/listen và provider config evidence.
- **Verification:** artifact + transcript/manual checklist hai phía.
- **Status:** `BLOCKED_EXTERNAL/NEEDS VERIFICATION`.

## P1 — Transport/tenant hardening chưa enforce

- **Issue:** production HTTP/IP; CSP report-only; tenant guard off; RLS set-config false.
- **Evidence:** runtime env snapshot và `tenant-rls.sql` header.
- **Root Cause:** staged rollout chưa hoàn tất.
- **Risk:** network exposure và thiếu DB defense-in-depth nếu application scope bug.
- **Recommended Fix:** HTTPS first; guard warn clean; RLS staging; IDOR suite; enforce.
- **Verification:** headers/TLS scan, zero warnings, RLS cross-org tests.
- **Status:** `NEEDS FIX`.

## P1 — DR chưa được restore-test

- **Issue:** daily DB dump chạy nhưng restore chưa diễn tập; media/config chưa có strategy xác minh.
- **Evidence:** backup logs/files; restore script chỉ inspect.
- **Root Cause:** backup generation được vận hành trước restore/off-host design.
- **Risk:** backup không dùng được hoặc app khôi phục thiếu file/secret.
- **Recommended Fix:** production-like isolated restore, backup media/config, checksum/off-host/alert.
- **Verification:** documented rehearsal với RPO/RTO và smoke.
- **Status:** `PARTIAL`.

## P2 — Functional/test/performance gaps

- Status và tag dual system; dashboard placeholders; authenticated role E2E thiếu; frontend chunk lớn; capacity chưa benchmark.
- **CAPACITY NOT YET BENCHMARKED**. Cần k6/Artillery/browser scenario theo concurrent sale, chat/socket, DB pool, Redis queue, Zalo/OmiCall quota và media.

Chỉ chuyển `READY FOR PRODUCTION` khi P1 được đóng/accepted bằng văn bản, restore rehearsal và role E2E pass.
