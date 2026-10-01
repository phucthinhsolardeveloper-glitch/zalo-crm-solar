# Handoff — Mục C Phase 1: gửi hàng loạt cá nhân (backend + worker)

Ngày: 2026-09-30. User duyệt cho phép gửi hàng loạt từ nick cá nhân trong giới
hạn; xác nhận là/đại diện chủ sở hữu bản quyền nên tự build trong Community.
Plan đầy đủ: `/home/admin01/.claude/plans/generic-bouncing-thimble.md`.

## DONE

- Tái sử dụng `AutomationBroadcast` + `Block` (schema có sẵn, thuộc open-core
  seam nhưng không phải mã `_ee`) — không tạo bảng mới.
- **`resolveBlockContent` — đã sửa gốc, không né:** phát hiện hàm này (ee-registry
  seam) mặc định Community luôn trả `ok:false` — route `/conversations/:id/send-block`
  có sẵn cũng bị vô hiệu vì vậy. Theo yêu cầu user ("cứ dùng đi chứ"), đã viết
  bản thật `backend/src/shared/block-content-resolver.ts` (text/image/album/
  video/file cho `send_message`) + đăng ký qua `registerAutomationHooks()` lúc
  app boot (trước `loadExtension()`, Extension thật sau này tự ghi đè nếu cài).
  **Bonus:** sửa 1 chỗ, lợi 2 tính năng — nút gửi Khối thủ công trong chat
  (trước đây cũng âm thầm hỏng) giờ cũng hoạt động, không chỉ broadcast.
- **Đối tượng broadcast — đã mở rộng theo phản hồi user:** không chỉ bạn bè
  (`friendshipStatus='accepted'`) mà cả người đã từng nhắn qua lại
  (`relationshipKind='chatting_stranger'`) — NVKD dùng được cho lead mới đang
  trò chuyện dở, không chỉ KH cũ đã kết bạn. Vẫn tuyệt đối chặn người chưa
  từng liên hệ (`none`/`ghost`) — giữ đúng 1 rủi ro cao nhất bị chặn, không
  máy móc chặn luôn use-case thật.
- Category quota mới `campaign_message` (50/ngày, burst 5/60s — tách hẳn khỏi
  `message` 300/ngày tổ chức trả lời khách), hàm `sendCampaignMessage()` riêng
  trong `zalo-operations.ts` (KHÔNG dùng chung `sendMessage()`).
- `backend/src/modules/broadcast/`: `broadcast-routes.ts` (CRUD + start/pause/
  cancel, gate `requireGrant('broadcast', ...)` — RBAC resource + grants đã có
  sẵn từ trước, đã verify DB thật: Marketing/Trưởng phòng/Admin/CEO full,
  Sale chỉ `access`), `broadcast-queue.ts` (BullMQ, copy convention
  `group-scan-queue.ts`), `broadcast-worker.ts` (xử lý theo chunk 10 contact/
  tick, tự enqueue tick kế tiếp cách nhau 30s).
- Cổng an toàn đã code + có test riêng cho từng cái:
  chặn gửi người chưa kết bạn (H-2), chặn contact đã revoke consent, hết quota
  → pause (không tính failed), kill switch tự động chặn (dùng chung gate đã
  làm ở A4), resume đúng từ `resumeCursor`, nick mất kết nối → pause ngay.
- Test mới `tests/broadcast-worker.test.ts`: 8/8 pass (thêm case cho phép
  chatting_stranger), `tests/block-content-resolver.test.ts`: 7/7 pass.

## VERIFIED

- `tsc --noEmit` sạch, `npx vitest run`: **71 files / 515 tests** pass (tăng từ
  69/500 đầu phiên do 2 file test mới).
- Không cần migration DB mới cho phần này (dùng schema có sẵn) — khác với
  mục E cùng phiên (có migration riêng).
- Đối chiếu RBAC thật trong DB: không có nhóm quyền nào bị khoá nhầm quyền
  `broadcast` (đã check trước khi báo cáo, học từ bài học P1 telephony RBAC).

## Phase 2 (Frontend) — ĐÃ XONG 2026-09-30, verify bằng browser thật

- `frontend/src/views/marketing/BroadcastsView.vue` (mới) — danh sách chiến
  dịch (tên/trạng thái/tiến độ/số bỏ qua), dialog tạo chiến dịch (chọn nick,
  nội dung, tìm+chọn khách hàng qua search thật), nút bắt đầu/tạm dừng/huỷ.
  Route `/marketing/broadcasts`, menu "Gửi hàng loạt" trong
  `CommunityMarketingShell.vue`.
- **Verify bằng Playwright thật** (không chỉ đọc code): dựng dev server riêng
  (port 5183, không đụng container thật), mint JWT test cho user admin, chụp
  màn hình thật — xác nhận trang render đúng, dialog mở đúng vị trí, **tìm
  kiếm khách hàng trả về kết quả THẬT từ DB** (gõ "a" ra đúng 2 contact thật).
  Phần tạo chiến dịch (POST /broadcasts) chưa test được end-to-end vì backend
  thật chưa deploy (API trả 404 đúng như dự kiến, có bắt lỗi graceful, không
  crash trang).
- **Bonus fix cùng lúc:** phát hiện + sửa 1 bug CSS z-index thật đang tồn tại
  từ trước (không liên quan mục C) — nút "Nhắc hẹn"/"Đặt lịch hẹn" trong
  `CustomerProfileDialog.vue`/`ContactDetailPanel.vue` bấm không thấy gì vì
  form `AppointmentEditor` bị kẹt phía sau popup (z-index 100 < 1200 của popup
  hồ sơ, và < ~2400 nếu mở từ `ContactDetailDialog.vue` dùng Vuetify). Nâng
  z-index `AppointmentEditor` lên 5000, verify bằng ảnh chụp trước/sau.

## REMAINING — CHƯA deploy (theo đúng yêu cầu user)

- **Chưa rebuild/restart app container** — toàn bộ code này (+ mục E, + A4 từ
  trước) chỉ nằm trong working tree, chờ user báo mới deploy. Runtime hiện chưa
  có backend Broadcast hoặc asset `BroadcastsView`.
- **Phase 2 (frontend) đã code và browser-verify ở môi trường cô lập** — màn
  tạo/theo dõi chiến dịch đã có, nhưng chưa được verify trên Full Docker `:3080`
  và chưa có API thật trong runtime cho tới khi deploy.
- **Segment chỉ nhận contactIds cố định** — chưa có bộ lọc động theo tag/status.
- **Multi-nick 1 broadcast** — chưa hỗ trợ, phải tạo nhiều broadcast riêng.
- **Chưa test tay bằng dữ liệu thật** — mới có unit test (mock), chưa chạy thử
  với 1 nick + vài contact thật của chính user như plan yêu cầu (mục 5 phần
  Verification) — nên làm việc này SAU khi deploy, TRƯỚC khi dùng cho khách
  hàng thật.

## RELEVANT FILES

`backend/src/modules/broadcast/` (routes/queue/worker, 3 file mới),
`backend/src/shared/zalo-operations.ts` (+category, +sendCampaignMessage),
`backend/src/modules/zalo/sdk-limit-service.ts` (+default limit),
`backend/src/app.ts` (đăng ký route + worker lifecycle),
`backend/tests/broadcast-worker.test.ts`.

## NEXT

1. User báo khi nào xong "nâng cấp" riêng → deploy 1 lần cho cả A4 + E + C.
2. Sau deploy: test tay bằng contact/nick thật của chính user trước (chưa
   dùng cho khách thật).
3. Khi cần: lên plan Phase 2 (frontend tạo/theo dõi chiến dịch).
