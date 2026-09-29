# Trạng thái project

## Kết luận

**NOT READY FOR PRODUCTION** theo tiêu chuẩn readiness của repository. Instance production đang chạy healthy về mặt hạ tầng, nhưng **chưa có dữ liệu/người dùng kinh doanh thật** (xem "Bối cảnh thật" bên dưới) — đang ở giai đoạn pre-launch, chưa phải production phục vụ khách hàng.

## Snapshot đã xác minh 2026-09-29 (qua SSH trực tiếp)

- Production VPS `pts-prod-01` (`222.255.182.182`), source `/srv/zcrm`, branch `master01`.
- Domain `https://zcrm.phucthinhsolar.com` trả HTTP 200 qua Caddy; TLS Let's Encrypt và HSTS hoạt động.
- `app`, `db`, `redis`, `clamav`, `backup` đều running/healthy, restart count app/backup bằng 0. MinIO không chạy trong profile production hiện tại vì app dùng local storage.
- `/health`: `{"status":"ok","db":"connected"}`; Prisma có 119 migration và schema up to date.
- Database là volume production mới, chưa nhập dữ liệu WSL; `/api/v1/setup/status` trả `needsSetup=true`.
- OmiCall/ZCC tắt; Telegram/AI chưa cấu hình credential production.
- Frontend 42/42 test pass và Vite production build pass cho thay đổi setup UI ngày 2026-09-29.

## Bối cảnh thật — DB gần như trống

Database production mới chưa có user/contact/conversation/message/call/campaign; owner đầu tiên chưa được tạo tại thời điểm snapshot. Chi tiết trạng thái kích hoạt từng tính năng: `docs/07-features/overview.md`.

**Ý nghĩa:** hạ tầng đã lên production nhưng chưa có ai dùng thật. Đây là cửa sổ đúng lúc để đóng các blocker P0/P1 trước khi onboard người dùng/dữ liệu thật — không nên coi nhẹ chỉ vì "chưa ai bị ảnh hưởng", nhưng cũng không cần xử lý với tốc độ "đang có sự cố ảnh hưởng khách hàng thật".

## Đã sửa trong repo 2026-08-24 (CHƯA deploy lên production — xem lưu ý ở trên; audit chi tiết: `10-audits/production-readiness.md`)

- P0: `fast-jwt` critical CVE (JWT auth bypass/algorithm confusion) — vá qua `npm audit fix`, không breaking.
- P1: XSS lưu trữ qua style-mark trong tin nhắn Zalo (`special-message-renderer.vue`) — đã validate trước khi chèn `v-html`.
- P1: không có chống brute-force `/login` — đã thêm rate-limit riêng 10 req/phút/IP.
- Backend `npm audit`: 38 → 13 lỗ hổng (critical 1→0). Frontend: 13 → 2 (còn `exceljs`/`uuid` moderate, cần breaking downgrade nên chưa tự làm).

## Blocker còn lại

- P0: tenant isolation không có lớp bảo vệ dự phòng (`TENANT_GUARD_MODE=off`, RLS chưa rollout) — cần staged rollout + test cross-org trước khi bật.
- P1: chưa có resource/grant `telephony` trong RBAC matrix.
- P1: chưa chứng minh recording chứa đủ hai phía thoại; legacy audit quan sát file mono.
- P1: HTTPS/domain đã hoàn tất, nhưng CSP vẫn report-only; tenant guard và RLS chưa rollout.
- P1: backup chỉ có DB, chưa có file/media (MinIO/`file_storage`); restore rehearsal chưa được thực hiện dù có script sẵn.
- P1: rủi ro khoá tài khoản do dùng API Zalo không chính thống (`zca-js`) — chưa có rate-limit/throttle cho outbound hàng loạt. Chi tiết + đề xuất: `docs/08-integrations/zalo.md`.
- P2: chưa có E2E ổn định theo Sale/Manager/Admin và cross-tenant.
- P2: status legacy `Contact.status` và dynamic `statusId/Status` còn song song.
- P2: nhiều dashboard/report field trả số 0 placeholder trong `report-analytics-routes.ts`.
- P2: frontend có chunk `exceljs` khoảng 930 kB và CSS chính khoảng 812 kB.
- P2: JWT lưu ở `localStorage` (không phải cookie httpOnly) — mọi lỗ XSS tương lai đều có thể đánh cắp token dài hạn (refresh token sống tới 90 ngày). Cần cân nhắc chuyển sang cookie httpOnly — đổi kiến trúc auth, cần quyết định trước khi làm.

Chi tiết issue/evidence/fix/verification: `docs/10-audits/production-readiness.md`.
