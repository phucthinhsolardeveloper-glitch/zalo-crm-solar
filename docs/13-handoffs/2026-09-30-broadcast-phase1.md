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
  `message` 5000/ngày tổ chức trả lời khách — con số organic được nâng từ
  200→5000 ở một thay đổi riêng, không liên quan trực tiếp mục C), hàm
  `sendCampaignMessage()` riêng trong `zalo-operations.ts` (KHÔNG dùng chung
  `sendMessage()`).
- `backend/src/modules/broadcast/`: `broadcast-routes.ts` (CRUD + start/pause/
  cancel, gate `requireGrant('broadcast', ...)` — RBAC resource + grants đã có
  sẵn từ trước, đã verify DB thật: Marketing/Trưởng phòng/Admin/CEO full. **Cập
  nhật 2026-10-01:** Sale ban đầu chỉ `access`, nay mở rộng thêm `create+edit`
  (quyết định user, chuẩn bị cho phòng kinh doanh dùng thử — xem policy doc),
  `broadcast-queue.ts` (BullMQ, copy convention
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

## ĐÃ DEPLOY (2026-10-01, cập nhật — mục này từng ghi "chưa deploy", nay lỗi thời)

- **User đã rebuild/restart Full Docker** — container `zalo-crm-app` hiện chạy
  image mới (`Created: 2026-10-01T03:56:21Z`). Verify thật: `/app/dist/modules/broadcast`
  và `/app/dist/shared/address-kit-client.js` có trong container;
  `curl localhost:3080/api/v1/broadcasts` và `.../api/v1/address/provinces`
  trả `401` (đúng — route tồn tại, chỉ thiếu token), KHÔNG còn `404`.
- Phần lớn code phiên này (A4, E, C Phase 1+2, fix z-index AppointmentEditor)
  đã được commit vào git (`cce3cbe1 feat: ship safe Zalo CRM workflows` +
  các commit fix/test theo sau).
- Chính sách canonical đã cập nhật theo:
  `docs/09-decisions/20260929-zalo-safe-operating-model.md` — mục 1, Tranche 1,
  Tranche 2, checklist vận hành (2026-10-01).

## ĐÃ NGHIỆM THU THẬT trên Full Docker (2026-10-01) — đóng mục còn thiếu lớn nhất

Codex audit (2026-10-01, commit `087d0a30`) xác nhận 72/72 file backend,
522/522 test pass, nhưng đúng chỉ ra "chưa có nghiệm thu gửi thật trên Full
Docker". Đã làm ngay sau đó, bằng API thật (không phải mock):

- Nick dùng test: **"Thy It"** (`8c1bc141-63fc-469e-b6df-51ce1bbb6486`,
  `status=connected` thật tại thời điểm test).
- Người nhận: contact **"Truyền File"** (`5fffcb4f-...`,
  `relationshipKind='chatting_stranger'`) — đây là tiện ích "gửi file cho
  chính mình" có sẵn của Zalo (Cloud/Lưu trữ tạm thời), KHÔNG phải khách hàng
  thật — chọn cố ý để test an toàn tuyệt đối, không làm phiền ai.
- `POST /api/v1/broadcasts` tạo thật → `POST .../start` → worker chạy →
  **`state=completed, sent_count=1, failed_count=0`** trong `automation_broadcasts`.
- Xác nhận bằng chứng cuối cùng: query trực tiếp bảng `messages` —
  `content="[TEST tự động] Nghiệm thu broadcast Phase 1 — không cần trả lời."`,
  `sender_type='self'`, `sent_via='user_native'` (đi qua đúng SDK Zalo thật,
  không phải stub) — tin nằm đúng trong lịch sử hội thoại.
- **Kết luận: broadcast Phase 1 gửi THẬT hoạt động đúng trên Full Docker đang
  chạy production thật của user.**

## Bug phát hiện qua audit Codex + ĐÃ SỬA cùng phiên (2026-10-01)

- **Trạng thái `scheduled` bị bỏ qua:** `/start` trước đây luôn set
  `state='running'` ngay cả khi `scheduledAt` còn ở tương lai — giao diện hiện
  "Đang gửi" sai sự thật trong lúc chờ, `startedAt` cũng ghi sai thời điểm
  (lúc bấm, không phải lúc gửi thật). Đã sửa: `/start` giờ set đúng
  `state='scheduled'` khi còn phải chờ; `processBroadcastTick` chấp nhận tick
  từ `scheduled`, tự chuyển sang `running` đúng lúc BullMQ job thật sự chạy,
  có thêm guard phòng lệch giờ hệ thống (tick nổ sớm → tự enqueue lại phần
  delay còn thiếu thay vì gửi sớm). Thêm 2 test mới cho đúng 2 nhánh này
  (12/12 test `broadcast-worker.test.ts` pass).
- **⚠️ Fix này CHƯA có trong container đang chạy** — chỉ nằm trong source code,
  cần rebuild để áp dụng (khác với phần nghiệm thu gửi thật ở trên, vốn đã
  chạy trên code CŨ trước khi có fix này — gửi ngay `scheduledAt=null` nên
  không gặp bug, chưa test lại nhánh `scheduled` trên container thật).

## Phase 3a — gửi ảnh/album qua broadcast (2026-10-01)

Yêu cầu gốc từ đầu dự án ("gửi ảnh cho nhiều khách hàng") — nay đã làm, CHƯA
deploy (chỉ có trong source, xem phần rebuild bên dưới):

- **Backend:** `POST /api/v1/broadcasts` nhận thêm `attachmentAssetIds: string[]`
  (ID ảnh từ Kho media `/api/v1/media` của CHÍNH org — server tự tra lại
  `publicUrl` thật từ `MediaAsset`, KHÔNG nhận URL trực tiếp từ client, chặn
  SSRF/IDOR). Tối đa 12 ảnh/chiến dịch. `messageText` giờ TUỲ CHỌN nếu có ít
  nhất 1 ảnh (trước đây bắt buộc).
- **`zalo-operations.ts`:** thêm `sendCampaignImage()` — sibling tách khỏi
  `sendImage()` (category `message`), dùng đúng quota `campaign_message` giống
  `sendCampaignMessage()`.
- **Worker (`broadcast-worker.ts`):** resolve Block → tối đa 1 phần text + 1
  phần ảnh/album (nhiều ảnh = gửi gộp album). Ảnh + text gộp thành **1 tin ảnh
  có caption** (KHÔNG tách 2 tin riêng) → chỉ 1 lần reserve quota/người nhận.
  Tải ảnh 1 LẦN/tick (không tải lại mỗi người nhận), dọn file tạm sau mỗi
  chunk. Block có thành phần chưa hỗ trợ (video/file/nhiều hơn 1 phần
  text-hoặc-media) → pause rõ ràng (`block_content_empty_or_unsupported`),
  không gửi thiếu. Tải ảnh lỗi → pause (`attachment_download_failed`), không
  tính failedCount sai.
- **Frontend (`BroadcastsView.vue`):** thêm "Ảnh đính kèm" trong dialog tạo —
  tải ảnh mới (multipart lên Kho media) hoặc chọn ảnh có sẵn (picker lưới,
  multi-select, đánh dấu đã chọn). Verify bằng Playwright thật trên dev server
  proxy backend thật: mở picker, Kho trả đúng ảnh thật từ DB, chọn/bỏ chọn,
  thumbnail + đếm "1/12" hiện đúng trong form sau khi đóng picker.
- Test mới `broadcast-worker.test.ts`: ảnh-không-text, text+album 2 ảnh (gộp 1
  tin, caption=text), thành phần chưa hỗ trợ → pause, tải ảnh lỗi → pause +
  dọn file tạm (16/16 test file này pass; toàn bộ **72 file/528 test** pass).
- **ĐÃ NGHIỆM THU GỬI ẢNH THẬT (2026-10-01, sau khi rebuild):** cùng kịch bản an
  toàn như lần nghiệm thu text — nick "Thy It" → contact "Truyền File". Tạo
  broadcast thật qua `POST /api/v1/broadcasts` với `attachmentAssetIds=[1 ảnh
  có sẵn trong Kho]` → `start` → `state=completed, sent_count=1, failed_count=0`.
  Xác nhận bằng query trực tiếp bảng `messages`: `content_type='image'`,
  `sent_via='user_native'`, caption đúng nội dung đã nhập, nằm đúng trong hội
  thoại. **Kết luận: Phase 3a gửi ảnh hoạt động thật trên Full Docker, không
  còn là rủi ro mở.**
- **Chưa làm (ngoài phạm vi Phase 3a):** video/file qua broadcast.

## API/E2E test cho route create/start/schedule (2026-10-01)

Codex nêu thiếu — đã làm: `backend/tests/broadcast-routes.test.ts` (mới, 21
test), dựng Fastify app thật + `inject()` (mirror `group-scan-routes.test.ts`),
mock ở biên prisma/RBAC/queue. Cover: RBAC 403, validate body (name/message-
hoặc-attachment/contactIds/batchSize), IDOR guard (nick khác org, contact khác
org, attachment khác org/kind), giới hạn 12 ảnh, và đặc biệt **2 nhánh
scheduled-state** (start ngay → running; start với scheduledAt tương lai →
scheduled, không phải running — đúng bug Codex phát hiện). Toàn bộ backend nay
**73 file / 549 test** pass.

## REMAINING

- **Segment chỉ nhận contactIds cố định** — chưa có bộ lọc động theo tag/status.
- **Multi-nick 1 broadcast** — chưa hỗ trợ, phải tạo nhiều broadcast riêng.
- **Video/file qua broadcast** — chưa hỗ trợ (chỉ text + ảnh/album, xem Phase 3a).

## RELEVANT FILES

`backend/src/modules/broadcast/` (routes/queue/worker, 3 file mới),
`backend/src/shared/zalo-operations.ts` (+category, +sendCampaignMessage),
`backend/src/modules/zalo/sdk-limit-service.ts` (+default limit),
`backend/src/app.ts` (đăng ký route + worker lifecycle),
`backend/tests/broadcast-worker.test.ts`.

## NEXT

1. **Đã nghiệm thu gửi thật thành công cả text VÀ ảnh** (2026-10-01) — không
   còn là rủi ro mở.
2. **Đã rebuild + deploy** (2026-10-01) — fix `scheduled` và Phase 3a đều đã
   chạy trên container thật.
3. **Đã có API/E2E test cho route create/start/schedule** (2026-10-01).
4. Khi cần: Phase 3b — video/file qua broadcast, multi-nick, bộ lọc động (xem
   mục "Tính năng dự kiến" trong policy doc).
