# Final Pre-Production Audit — 2026-08-21

## Kết luận điều hành

**NOT READY FOR PRODUCTION.** Bản hiện tại build và chạy được, các luồng CRM/calling/import-export chính đã có nền tảng tốt, và các lỗi an toàn tìm thấy trong lượt audit này đã được sửa. Tuy nhiên chưa được đưa người dùng công ty vào sử dụng thật trước khi đóng các blocker:

- File ghi âm OmiCall thực tế là mono; chưa chứng minh có đủ hai phía thoại.
- Telephony chưa có resource RBAC riêng; hiện chỉ scope theo user/role trong code.
- CSP mới report-only; tenant guard/RLS chưa rollout.

## Bằng chứng đã kiểm tra

- Git: branch `fix/omicall-sip-call-history`, HEAD `05b33b0`; thay đổi audit vẫn uncommitted.
- Typecheck: backend `tsc --noEmit` pass; frontend `vue-tsc -b` pass.
- Production build: Docker multi-stage build pass; artifact được grep trực tiếp trong container.
- Test: frontend 36/36 pass. Backend Community 60 file, 463/463 pass; 5 suite bảo mật dùng PostgreSQL thật 23/23 pass; test ghi âm/storage mục tiêu 11/11 pass.
- Runtime: `zalo-crm-app` healthy, `/health` 200; contacts/statuses/recording API trả 401 khi không JWT; ClamAV enabled + fail-closed và chặn EICAR thật.
- Database: mọi migration hiện có đã deploy, gồm `contact_importance_level`; không migration dở/rollback; 3.941 contact; không trùng `phone_normalized` trong contact chưa merge; không lệch org CallNote↔Call hoặc Conversation↔Contact; không ngày sinh lệch năm; không consent revoked thiếu timestamp.
- Calling: 31 CallLog, 8 có recording, 2 row `initiated` treo quá một giờ trước fix cleanup.
- Status: bảng `statuses` có 0 row, 3.941 contact dùng legacy status `new`, 0 contact có `status_id`.
- Browser: authenticated smoke test sau deploy đã xác nhận OmiCall kết nối, dial suggestions, gọi lại từ popup, thống kê cuộc gọi, gợi ý tỉnh/thành và trường mức độ quan trọng.

## Ma trận tính năng

- **Working:** auth/refresh architecture, tenant-scoped Contact CRUD, hồ sơ desktop, universal CallButton, OmiCall connect/history core, CallNote append-only newest-first, recording mã hóa + proxy có auth, CSV/XLSX import-export cơ bản, Zalo listener/reconnect, Redis/Socket.IO, migrations, Docker build/start/health.
- **Fixed:** lưu field hồ sơ/activity diff; panel chi tiết; route hồ sơ thật; webchat classification; export menu/template/filter; multi-nick pagination; stale CallLog cleanup; status filter; Status RBAC; one-off backfill isolation; deprecated migration disabled; realtime log redaction; friend-invite test-mode default; app healthcheck; private recording storage; antivirus upload.
- **Partial:** two-way recording audio, calling RBAC, dynamic-vs-legacy status, CSP/RLS, analytics cross-check, full cross-role browser E2E.
- **Missing:** telephony resource trong permission matrix; stable production E2E suite; provider thứ hai.
- **Duplicated:** `ContactDetailDialog.vue` mobile và `CustomerProfileDialog.vue` desktop; `Contact.status` và `statusId/Status`; nhiều đường edit customer field.
- **Deprecated:** `/api/v1/admin/migrate-status-table` runtime 8-status cũ; hiện trả 410.
- **Needs Fix:** các mục Remaining/Blocked bên dưới.

## P0 Critical

### P0-1 — One-off maintenance sửa cross-tenant — Fixed

- **Issue:** mọi user có JWT từng gọi được Status migration và ba backfill; service quét toàn DB.
- **Root Cause:** chỉ có auth hook, thiếu grant và thiếu `orgId` trong query.
- **Affected Area:** Contact/Friend/Status toàn tenant.
- **Risk:** mutation diện rộng; migration còn seed pipeline 8 trạng thái sai yêu cầu 10 trạng thái.
- **Fix:** migration trả 410; backfill yêu cầu `settings.edit` và `orgId` bắt buộc.
- **Test:** typecheck/build pass; anonymous API 401; artifact có `STATUS_MIGRATION_DEPRECATED`.
- **Status:** Fixed; cần thêm integration test theo permission group.

### P0-2 — URL ghi âm thô không auth — Fixed

- **Issue:** player dùng route auth nhưng file mirror vẫn ở static `/files/media/<hash>.mp3`.
- **Root Cause:** recording dùng chung namespace media public.
- **Affected Area:** recording/privacy/compliance.
- **Risk:** ai có URL tải được hội thoại không cần session.
- **Fix:** AES-256-GCM trước khi lưu; namespace `recordings/`; DB chỉ giữ reference nội bộ; local static trả 404; R2/public bucket chỉ thấy ciphertext; route auth mới giải mã trong server. Migration idempotent đã chuyển 8/8 record và xóa 8/8 file public cũ sau kiểm tra tham chiếu.
- **Test:** crypto/dedup/tamper/path 4/4; OmiCall recording/history 7/7; production build pass; `/files/recordings/*` 404; recording API anonymous 401; đọc và giải mã object production thành công.
- **Status:** Fixed. Authenticated cross-role playback vẫn nằm trong browser regression P2-8.

## P1 High

### P1-1 — Group message history 404 — Fixed

- **Issue:** log cho thấy nhiều group ở hai Zalo account trả 404 mỗi chu kỳ sync.
- **Root Cause:** `zca-js` 2.1.2 HTTP `getGroupChatHistory` gọi endpoint `/api/group/history` đã bị provider trả 404; SDK vẫn hỗ trợ history nhóm qua WebSocket `requestOldMessages(ThreadType.Group)`.
- **Affected Area:** lịch sử nhóm, retry/log volume, dữ liệu stale.
- **Risk:** mất lịch sử nhóm nhưng UI có thể khiến người dùng tưởng đã sync.
- **Fix:** periodic backup và initial backfill nhóm chuyển sang đường WebSocket/pagination đã có trong SDK; bỏ vòng HTTP hỏng gây 404 cho từng group.
- **Test:** backend typecheck/build pass; sau nhiều chu kỳ 5 phút, log runtime không còn `Group ... 404`/`status code 404`.
- **Status:** Fixed; vẫn theo dõi số lượng message backfill ở group lớn.

### P1-2 — Recording mono/chưa chứng minh hai giọng — Blocked

- **Issue:** 5 file ffprobe đều một channel; yêu cầu hai phía chưa đạt bằng chứng.
- **Root Cause:** provider trả mono trước khi CRM lưu nguyên byte.
- **Affected Area:** QA/coaching/compliance.
- **Risk:** có thể thiếu một phía dù player chạy.
- **Fix:** OmiCall bật dual-leg/mixed recording hoặc nhận từng leg rồi mix.
- **Test:** cuộc gọi kiểm soát với câu thoại định danh ở cả hai phía.
- **Status:** External blocker.

### P1-3 — Calling chưa có RBAC resource — Remaining

- **Issue:** permission matrix không có `telephony`; route chỉ auth/active-user và scope nội bộ.
- **Root Cause:** calling thêm sau thiết kế RBAC.
- **Affected Area:** history, dialer, notes, recording, sync.
- **Risk:** không cấu hình được quyền gọi/ghi âm độc lập; nhóm không nghiệp vụ vẫn có surface.
- **Fix:** thiết kế `telephony` actions, migrate grants, API và route/menu guard.
- **Test:** role → effective grant → API → UI cho Sale/Manager/HR/Admin.
- **Status:** Remaining; cần duyệt business rule.

### P1-4 — Backend baseline đỏ — Fixed

- **Issue:** 43 test fail; 34 suite import module Community không tồn tại, số còn lại mock/fixture drift.
- **Root Cause:** test chưa tách Community/extension và mock chưa theo contract mới.
- **Affected Area:** regression confidence.
- **Risk:** regression thật bị che trong baseline đỏ.
- **Fix:** cấu hình Community loại đúng các suite lịch sử thuộc Automation/Lead Ads/EE không có source; suite DB thật chỉ bật bằng `RUN_DB_TESTS=true`; cập nhật mock/fixture theo transaction tenant, RBAC, presence cache, SDK group shape và friend full-sync hiện tại.
- **Test:** Community 60 file, 463/463 pass; 5 suite bảo mật PostgreSQL thật 23/23 pass; `tsc --noEmit` pass.
- **Status:** Fixed. Suite extension chỉ chạy khi bundle extension tương ứng được đưa trở lại.

### P1-5 — Hai hệ Status song song — Partial

- **Issue:** `status` legacy và `statusId`; dynamic table trống, form/import/export dùng 10 slug.
- **Root Cause:** cutover dừng giữa lộ trình; runtime migration cũ dùng 8 bước khác.
- **Affected Area:** filter/report/friend status/automation/import-export.
- **Risk:** các module đọc hai nguồn cho kết quả khác nhau.
- **Fix:** chốt mapping 10 status, dry-run/backup, dual-write ngắn rồi cutover.
- **Test:** counts, reports, automation, round-trip, rollback rehearsal.
- **Status:** Partial; Contact filter tạm dùng pipeline legacy thật để không rỗng.

### P1-6 — Upload malware controls tắt — Fixed

- **Issue:** ClamAV healthy nhưng `MEDIA_AV_ENABLED=0`, fail-closed=0.
- **Root Cause:** rollout antivirus chưa bật.
- **Affected Area:** media/chat uploads.
- **Risk:** file độc hại được lưu/phân phối.
- **Fix:** production bật `MEDIA_AV_ENABLED=1`, `MEDIA_AV_FAIL_CLOSED=1`; nối scan vào Media Library/save-from-chat, gửi attachment, avatar, ảnh chào mừng và remote mirror. File/archive >100MB bị chặn; media lớn được phép với warning để giữ luồng video.
- **Test:** ClamAV 1.4.6 database hiện hành; clean=`clean`; EICAR=`infected` + blocked; mô phỏng DNS daemon lỗi=`error` + blocked; archive 100MB+=`unscanned` + blocked; app health 200.
- **Status:** Fixed; cần theo dõi latency/false-positive trong vận hành.

## P2 Medium

### P2-1 — Multi-nick filter sai pagination — Fixed

- **Issue:** lọc `childrenCount > 1` sau `skip/take/count` làm hụt dòng và total sai.
- **Root Cause:** derived filter ở enrichment layer.
- **Affected Area:** Contacts pagination/export.
- **Risk:** bỏ sót khách và số liệu sai.
- **Fix:** group Friend active/non-ghost trước query, giao ID với contact scope.
- **Test:** typecheck/build pass; cần fixture API 0/1/2+ nick.
- **Status:** Fixed.

### P2-2 — Export stub/không đủ filter — Fixed

- **Issue:** menu báo “chưa implement”; export chỉ gửi search/assigned user.
- **Root Cause:** đường UI cũ và contract filter không đồng bộ.
- **Affected Area:** Contacts export.
- **Risk:** file không khớp list đang xem.
- **Fix:** menu gọi XLSX thật; truyền source/status/thread/Zalo/relation/multiNick/score/date.
- **Test:** frontend typecheck/build; compiled bundle có params; browser download còn pending.
- **Status:** Fixed.

### P2-3 — Không có import template — Fixed

- **Issue:** import có mapping/preview nhưng không có mẫu tải.
- **Root Cause:** UI chỉ có picker.
- **Affected Area:** onboarding import.
- **Risk:** sai header/enum, tăng dòng lỗi.
- **Fix:** CSV BOM, đúng 13 header, sample tiếng Việt và quoted address.
- **Test:** build pass; parser có 9 edge-case test.
- **Status:** Fixed, browser download pending.

### P2-4 — CallLog treo — Fixed

- **Issue:** DB có 2 row initiated quá một giờ.
- **Root Cause:** có thể mất SDK callback, webhook và history match.
- **Affected Area:** history/analytics.
- **Risk:** trạng thái/thống kê sai.
- **Fix:** sau sync, row OmiCall thiếu provider ID quá 15 phút thành `failed`, giữ notes/audit.
- **Test:** unit target pass; artifact có end reason mới.
- **Status:** Fixed; row cũ dọn ở sync kế tiếp.

### P2-5 — INFO log chứa metadata Zalo — Fixed

- **Issue:** raw reaction/typing/delivery payload ở INFO.
- **Root Cause:** trace phát triển để sai log level.
- **Affected Area:** privacy/log cost.
- **Risk:** UID/thread/message IDs lưu trong log và log churn.
- **Fix:** hạ payload/diagnostic xuống debug, giữ warning/error thật.
- **Test:** build/deploy và startup log kiểm tra lại.
- **Status:** Fixed.

### P2-6 — Docker test mode/healthcheck — Fixed

- **Issue:** production compose default friend-invite test mode true; app không healthcheck.
- **Root Cause:** default overnight test sót lại.
- **Affected Area:** automation/deployment.
- **Risk:** gửi lời mời nhanh ngoài ý muốn; orchestrator không biết app hỏng.
- **Fix:** default false, Node fetch `/health`, bỏ compose version obsolete.
- **Test:** container env false; service healthy.
- **Status:** Fixed.

### P2-7 — Frontend bundle lớn — Remaining

- **Issue:** `exceljs` ~930 KB, chunks >500 KB, CSS index ~810 KB.
- **Root Cause:** spreadsheet/UI payload lớn.
- **Affected Area:** first load/mobile memory.
- **Risk:** tải chậm ở mạng yếu.
- **Fix:** lazy-load import/exceljs, kiểm tra CSS split.
- **Test:** Lighthouse/Web Vitals trên thiết bị sale.
- **Status:** Remaining.

### P2-8 — Browser regression authenticated — Blocked

- **Issue:** `/contacts` redirect login do session hết hạn.
- **Root Cause:** phiên hiện có không còn hợp lệ; audit không đọc storage/cookie hoặc tự dùng credential.
- **Affected Area:** visual/click/download verification.
- **Risk:** lỗi UI có thể chưa bị typecheck bắt.
- **Fix:** đăng nhập lại và chạy create/edit/filter/export/import/call/recording/RBAC.
- **Test:** browser assertions theo role.
- **Status:** Blocked by authenticated session.

## P3 Future

- Multi-carrier: chỉ làm khi có provider thứ hai và routing rule thật.
- Gộp dialog mobile/desktop: refactor sau khi có visual regression tests.
- CSP/RLS/tenant guard: rollout warn/staging trước enforce.
- Analytics reconciliation: SQL fixture đối chiếu dashboard/report theo timezone/team.
- Large import/export: hiện import cap 5.000, export cap 20.000; cần background job và cảnh báo truncation khi quy mô tăng.

## Working / Fixed / Remaining / Blocked

- **Working:** build/typecheck/deploy/health; frontend tests; migrations; phone dedup hiện tại; core profile; call/call-note/recording proxy; import-export; Zalo realtime; Redis/Socket.IO.
- **Fixed:** P0-1, P0-2, P1-1, P1-4, P2-1 đến P2-6 và nhóm hồ sơ khách hàng trong CHANGELOG.
- **Remaining:** telephony RBAC, Status cutover, performance, analytics reconciliation, full browser E2E theo từng role.
- **Blocked:** two-party audio cần OmiCall/provider.

## Điều kiện chuyển sang READY

Chỉ đổi sang **READY** khi P1-2/P1-3 được đóng hoặc có acceptance bằng văn bản; browser E2E theo Sale, Trưởng phòng, Admin; recording xác nhận cả hai giọng; backup/restore và restart rehearsal trên staging giống production.
