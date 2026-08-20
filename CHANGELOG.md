# Changelog

Các thay đổi đáng chú ý của ZCRM. Theo [Semantic Versioning](https://semver.org/lang/vi/).

> Các tag `v1.x`–`v3.3.x` là **lịch sử upstream** (locphamnguyen/ZaloCRM) — xem đầy đủ ở cuối file.
> `v3.4.x` là dòng release hiện tại.

## [Unreleased] - Tuỳ biến nội bộ Phúc Thịnh Solar

### Added (8) — Phase 2 Continued: Calling, Export, Recording & Final Verification 2026-08-20
- **Xuất khách hàng .xlsx/.csv** — `GET /api/v1/contacts/export?format=xlsx|csv`, ĐÚNG field/
  label/enum với Import (`contact-export-service.ts` phản chiếu `TARGET_FIELDS` của
  `ContactImportDialog.vue`/`contact-import-service.ts`) — file xuất ra import lại được
  không mất dữ liệu. Mang theo filter search + sale phụ trách đang áp dụng ở màn Danh sách
  (2 filter thực sự có tác dụng hiện nay; `statusId` — bảng Status động chưa dùng — không
  mang theo, tránh gây hiểu nhầm là filter đang hoạt động). RBAC scope giống hệt
  `GET /contacts` (`getContactScope`). 2 nút mới ở toolbar Contacts: "📤 Xuất Excel"/"📤 Xuất CSV".
- **Nghe ghi âm qua cổng có auth** — `GET /telephony/calls/:id/recording` (mới): kiểm tra
  quyền xem cuộc gọi (`assertCallVisible` — chủ cuộc gọi hoặc owner/admin) trước khi trả
  byte ghi âm, thay vì trước đây FE phát thẳng URL kho lưu trữ (`/files/media/<hash>.mp3`)
  — URL đó phục vụ KHÔNG auth (route static dùng chung cho nhiều tính năng media khác, cố
  tình không khoá lại toàn bộ vì rủi ro phá vỡ diện rộng — xem "Chưa làm/known limitation"
  bên dưới). FE (`CallHistoryView.vue`, `TelephonySoftphone.vue`) đổi sang fetch blob qua
  cổng auth này (cùng pattern tải file đã dùng ở `message-bubble.vue`) → xử lý êm khi ghi
  âm hết hạn/bị xoá (báo lỗi rõ ràng thay vì trình phát vỡ trắng), không còn lộ URL kho ra
  DOM. Mirror lỗi (chưa kịp tải về kho, `recordingId` còn là URL gốc OmiCall) → endpoint tự
  fetch lại theo yêu cầu, không lộ URL gốc cho FE.
  **Điều tra nguyên nhân "khách nghe được, sale không nghe được" (anh báo)**: audit code xác
  nhận pipeline ghi âm (OmiCall → fetch → buffer thô → lưu kho) KHÔNG xử lý/chọn kênh nào —
  fetch `ffprobe` thật trên 5 file ghi âm thật (qua `docker exec` vào container app, đọc
  trực tiếp `/var/lib/zalo-crm/files/media/`) xác nhận **CẢ 5 file đều MONO (1 kênh),
  22050Hz mp3**, thời lượng khớp `durationSec` trong DB (không bị cắt/lỗi file). Kết luận:
  đây KHÔNG phải lỗi code CRM (không có kênh thứ 2 nào để chọn/mix) — OmiCall chỉ trả về 1
  kênh duy nhất cho các cuộc gọi này. Nguyên nhân thực sự (phía OmiCall hoặc cấu hình ghi âm
  server-side của OmiCall) cần xác nhận với OmiCall support hoặc kiểm tra cài đặt ghi âm
  stereo/dual-track trong dashboard OmiCall — nằm ngoài khả năng sửa từ phía CRM.
- **Gọi lại được cuộc gọi nội bộ ở Lịch sử cuộc gọi** — dòng kênh "Nội bộ" (đồng nghiệp gọi
  nhau qua extension, không có SĐT ngoài) trước đây nút Gọi luôn tắt (vì dựa vào
  `externalNumber`, luôn null cho cuộc gọi nội bộ) và tên khách hiện "Không rõ khách hàng".
  `CallButton.vue` thêm prop `peer` (gọi qua `callPeer()` thay vì `callPhone()`);
  `CallHistoryView.vue` khớp `call.peerUser.id` với danh sách peer đang tải (từ softphone
  toàn cục) để lấy đúng extension hiện tại, hiện đúng tên đồng nghiệp. Nút "Tạo khách
  hàng"/"Gắn vào khách hàng có sẵn" (vốn chỉ hợp lý cho SĐT ngoài) cũng ẩn đi cho dòng nội bộ.
- **Nới lỏng validate SĐT khi gọi** — `normalizeVnPhone()` (FE, `use-omicall-softphone.ts`)
  và re-check trùng lặp ở `POST /telephony/calls` (BE) trước đây CHỈ chấp nhận đúng
  84+11-12-digit (mobile VN chuẩn) — chặn nhầm số lịch sử/số nước ngoài/số 9-digit mà
  `normalizePhone()` (BE, dùng cho Contact) đã chấp nhận hợp lệ từ trước. Cả 2 phía giờ
  dùng cùng quy tắc LOOSE như `normalizePhone()`. Verify thật: số 11-digit không phải VN
  (`12025551234`) và số VN 9-digit không có số 0 đầu (`936668266`) đều tạo CallLog thành
  công qua `POST /calls` sau khi sửa (trước đó bị từ chối "Số điện thoại Việt Nam không hợp lệ").
- **`resolve-conversation-target` yêu cầu Contact đã liên kết** — audit + kiểm tra dữ liệu
  thật (`SELECT count(*) FILTER (WHERE contact_id IS NULL AND "threadType"='user')` → 0/64
  hội thoại) xác nhận ĐÂY KHÔNG PHẢI bug đang chặn use case thật nào — pipeline tạo tin nhắn
  (`message-handler.ts`) luôn resolve/tạo Contact TRƯỚC khi tạo Conversation, nên
  `conversation.contact` trong thực tế luôn có giá trị. Giữ nguyên (không sửa mù vào code
  gọi qua Zalo OA/ZCC — rủi ro cao, không có use case thật để verify).
- **Dead `tel:` links → gọi qua tổng đài thật** — `FriendsView.vue`, `ListDetailView.vue`,
  `LeadDetailPanel.vue` (2 chỗ) trước đây dùng `<a href="tel:...">`/`window.location.href`
  (mở app điện thoại native — không tồn tại trên desktop CRM, không tạo CallLog, không qua
  RBAC/tổng đài). Đổi hết sang `useOmicallSoftphone().callPhone()` — cùng service với mọi
  nơi gọi khác. `FriendsTable.vue` (bảng Bạn bè) trước đây KHÔNG có hành động gọi nào — thêm
  nút 📞 mới, emit `call` lên `FriendsView.vue`.
- **Fix parser CSV** (`use-spreadsheet-parser.ts`) — bản cũ chỉ `line.split(',')` thô, vỡ
  với: cell có dấu phẩy trong ngoặc kép (`"123 Nguyễn Huệ, Q.1"`), escape `""` kiểu RFC4180,
  xuống dòng trong 1 cell. Viết lại bằng state-machine char-by-char (không thêm thư viện
  mới). 9 test case mới (`use-spreadsheet-parser.spec.ts`), gồm dữ liệu khách hàng điện mặt
  trời tiếng Việt thật (tên/địa chỉ có dấu, có dấu phẩy) — chạy `npx vitest run` xác nhận
  10/10 pass.
- **Fix bug 502 lặp lại ở đồng bộ lịch sử cuộc gọi (phát hiện lúc verify E2E)** —
  `omicall-history-sync.ts`: khi VỪA có `pending` (row sống tạo lúc bấm gọi) VỪA đã có
  `existing` (row transactionId này từ 1 lần sync trước — vd gọi lại nhanh cùng số/khoảng
  thời gian tạo nhiều `pending`), code cũ luôn ưu tiên update `pending` → set
  `providerCallId` trùng `existing` → vỡ unique constraint (`ownerUserId`, `providerCallId`)
  → CẢ sync request 502, các cuộc gọi còn lại trong trang không đồng bộ được. Bắt được qua
  console browser thật lúc verify (không phải qua đọc code) — lặp lại y hệt mỗi ~1.5 phút
  trên cùng 1 transaction id thật trong DB. Sửa: ưu tiên update `existing` (canonical) nếu
  đã có, bỏ qua an toàn `pending` thay vì cố ghi đè gây lỗi; `upsert()` đổi thành nhánh
  `update`/`update`/`create` tường minh không còn khả năng đụng độ. Cập nhật lại
  `tests/omicall-history-sync.test.ts` theo hành vi mới — full suite xác nhận đúng 43 lỗi
  baseline đã biết, không phát sinh regression mới.

### Chưa làm / known limitation
- URL ghi âm thô (`/files/media/<hash>.mp3`) vẫn phục vụ KHÔNG auth — route static dùng
  chung cho ảnh/video/file media library khác, khoá lại toàn bộ rủi ro phá vỡ diện rộng
  (avatar, ảnh chat, v.v.). Cổng auth mới (`/telephony/calls/:id/recording`) là đường
  CHÍNH THỨC app dùng; URL kho vẫn kỹ thuật truy cập được nếu bị lộ (hash khó đoán, nhưng
  không phải bảo mật thật). Cần thiết kế storage-key riêng cho ghi âm (khác namespace với
  media library) nếu muốn khoá triệt để — chưa làm đợt này.
- Nguyên nhân gốc "sale không nghe được" (mono từ phía OmiCall) — cần xác nhận/khắc phục
  từ phía OmiCall (support hoặc cấu hình dashboard), không sửa được từ code CRM.
- Dòng dữ liệu mồ côi trong Lịch sử cuộc gọi (1 dòng "Từ chối" 0335622260 13:54 20/08, tạo
  lúc còn bug sync) — vô hại (hiện như 1 cuộc gọi bình thường, không có ghi âm/thời lượng),
  không xoá vì không chắc chắn 100% không phải dữ liệu gọi thật của người dùng.

### Added (7) — Phase 2 hoàn tất: link KH có sẵn + hover note + import Excel 2026-08-20
- **"Gắn vào khách hàng có sẵn" ở Call History** — hoàn thiện post-call actions cho số lạ:
  trước đây chỉ có "Tạo khách hàng" (luôn tạo mới), giờ có thêm ô tìm kiếm (dùng lại
  `GET /telephony/dial-suggestions`) để gắn cuộc gọi vào 1 KH ĐÃ CÓ SẴN — đúng trường hợp
  số này là SĐT phụ của khách cũ, không phải khách mới.
- **Ghi chú mới nhất khi hover SĐT trong khung chat** — `ChatContactPanel.vue` hiện icon
  cạnh ô SĐT, hover xem nhanh / bấm xem đầy đủ lịch sử ghi chú cuộc gọi gần nhất. Endpoint
  mới `GET /telephony/contacts/:contactId/latest-call`.
- **Import khách hàng từ Excel/CSV** — pipeline đầy đủ Upload → Column Mapping (tự đoán
  cột theo tên tiêu đề, sửa tay được) → Preview (validate + phát hiện trùng SĐT, cả với
  Contact có sẵn LẪN trùng nội bộ trong cùng file) → Import → Result (số dòng
  tạo/bỏ qua/lỗi). Tái dùng: `use-spreadsheet-parser.ts` (tách từ `CreateListModal.vue`,
  cùng thư viện `exceljs` đã audit bảo mật), `normalizePhone` + pattern dedup của
  `quick-create` (contact-routes.ts). KHÔNG bao giờ insert mù — trùng SĐT/thiếu
  tên/SĐT/SĐT sai định dạng đều bị skip và báo cáo rõ, không âm thầm bỏ qua.
  Nhãn Trạng thái/Đối tượng tiếng Việt trong file ("Đã mua hàng", "Đại lý") tự map về đúng
  slug nội bộ (`purchased`, `agent`) khớp dropdown CRM — không lưu nhầm text hiển thị.
  Xử lý cả 2 lỗi Excel thường gặp: ô ngày sinh dạng Date object (không phải string) và
  ngày viết tay dd/mm/yyyy (JS Date mặc định đọc kiểu Mỹ mm/dd/yyyy, dễ sai âm thầm — giờ
  bị từ chối rõ ràng thay vì lưu nhầm ngày).
  **Bug bắt được lúc test thật (không phải chỉ typecheck)**: `ContactImportRow.status`
  (trạng thái KH mong muốn, vd "Đã mua hàng") và `ContactImportPreviewRow.status` (kết quả
  validate: valid/invalid/duplicate) trùng tên field — TypeScript không báo lỗi (cả 2 đều
  compatible với `string`), nhưng ở runtime field sau ghi đè field trước, khiến Contact
  import ra bị lưu `status="valid"` (literal) thay vì `"purchased"`. Đổi tên field domain
  thành `contactStatus` để hết đụng. Phát hiện qua test thật `POST .../commit` rồi đọc lại
  Contact vừa tạo — không phải qua đọc code hay `tsc --noEmit`.

### Fixed (4) — Phase 2 tiếp, phát hiện khi mở rộng analytics 2026-08-20
- **Regression tự phát hiện: đổi status pipeline (đợt trước) làm hỏng 3 module analytics** —
  `team-performance.ts`, `conversion-funnel.ts`, `custom-report.ts` đều hard-code
  `status = 'converted'`/`STAGE_ORDER` theo pipeline generic cũ (5 bước). Sau khi đổi
  `STATUS_OPTIONS` sang 10 bước thật, KHÔNG còn ai ghi `status='converted'` nữa → 3 báo cáo
  này sẽ luôn hiện 0 cho mọi dữ liệu mới. Sửa: "converted" (cho mục đích báo cáo) = đã tới
  1 trong 2 giai đoạn thành công (`closed_won`/`purchased`); `STAGE_ORDER` cập nhật đúng 10
  bước thật. Phát hiện trong lúc code call-stats (đọc lại `team-performance.ts` mới thấy).
- **Build "thành công" nhưng deploy code cũ** — `docker compose build app | tail -40` che
  mất exit code thật (build FE fail vì lỗi type thật, không phải noise) → redeploy dùng lại
  image cũ. Từ giờ luôn capture exit code riêng + verify code đã compile trong container
  trước khi tin bất kỳ lần build/deploy nào.

### Added (6) — Phase 2 tiếp: dialer autocomplete + call stats 2026-08-20
- **`CallButton` gắn thêm vào**: bảng danh sách khách hàng (`ContactsView.vue`) và panel chi
  tiết bên (`ContactDetailPanel.vue`) — còn `CustomerProfileDialog.vue` bỏ qua vì đó vẫn là
  view "skeleton" (phone chỉ có ô nhập, không có view mode để gắn nút).
- **Dialer autocomplete** — gõ tên/SĐT trong popup gọi (`TelephonySoftphone.vue`) hiện gợi ý
  khớp khách hàng có sẵn trong CRM (debounce 250ms), kèm trạng thái + thời gian cuộc gọi gần
  nhất nếu có. Bấm gợi ý gọi thẳng, tự gắn đúng `contactId`. Endpoint mới
  `GET /telephony/dial-suggestions`.
- **Thống kê cuộc gọi vào analytics chung** — `team-performance.ts` (bảng xếp hạng đội nhóm)
  giờ có thêm: tổng cuộc gọi, đã nghe/tổng, tỷ lệ kết nối, thời gian gọi trung bình — tái
  dùng đúng `TelephonyCall` (bảng Call History/softphone đã ghi sẵn), KHÔNG tạo bảng thống
  kê riêng. Hiện ở `TeamLeaderboard.vue`.

### Added (5) — Phase 2 calling core 2026-08-20
- **`CallNote` — ghi chú GẮN VỚI 1 CUỘC GỌI CỤ THỂ**, khác hẳn `Note` (ghi chú chung của
  khách hàng). Model mới + `GET/POST /telephony/calls/:id/notes`, chronological, mới nhất
  hiện trước, KHÔNG BAO GIỜ ghi đè note cũ. `GET /telephony/calls` giờ trả kèm `latestNote`
  mỗi dòng (1 query gộp, không N+1) để hiện preview mà không cần mở riêng.
- **`CallButton.vue` — nút gọi tái dùng** (`frontend/src/components/telephony/CallButton.vue`),
  bọc `useOmicallSoftphone().callPhone()` với UI/lỗi nhất quán. Đã gắn vào: header hồ sơ
  khách hàng (`ContactDetailDialog.vue`, trước đây phone chỉ là text tĩnh) và mỗi dòng ở
  Lịch sử cuộc gọi (`CallHistoryView.vue`, trước đây KHÔNG có nút gọi nào ở trang này).
  `callPhone()` giờ nhận thêm `contactId`/`fullName`/`avatarUrl` để CallLog tự gắn đúng
  khách hàng thay vì luôn tạo record "số lạ".
- **Ghi chú ngay sau khi cúp máy** — `TelephonySoftphone.vue` hiện `CallNotesPanel` ngay ở
  màn "Cuộc gọi đã kết thúc", gắn thẳng vào `CallNote` của đúng cuộc gọi vừa xong
  (`activeCallLogId`, đổi từ biến private `localCallId` sang ref để UI đọc được).
- **Số lạ ở Lịch sử cuộc gọi → Tạo khách hàng ngay** — nút "Tạo khách hàng" ở mỗi dòng chưa
  có KH, dùng lại đúng `AddCustomerQuickDialog.vue` có sẵn (không xây dialog mới), tạo xong
  tự động `PATCH` gắn `contactId` ngược vào đúng CallLog đã bấm.
- `PATCH /telephony/calls/:id` mở rộng nhận `contactId` — owner/admin gắn được cho MỌI cuộc
  gọi trong org (hành động quản trị), các field vòng đời khác (status/duration/...) vẫn giữ
  nguyên chỉ chính chủ cuộc gọi mới sửa được.

**Chưa làm trong đợt này** (vẫn nằm trong roadmap Phase 2): gắn `CallButton` vào danh sách
khách hàng dạng bảng (`ContactsView.vue`) và các panel khác (`ContactDetailPanel.vue`,
`CustomerProfileDialog.vue`); xem "ghi chú mới nhất" khi hover số điện thoại ở khung chat;
dialer autocomplete theo call history/contacts; thống kê cuộc gọi trong analytics chung;
import Excel khách hàng; multi-carrier routing.

### Fixed (3) — Full-system audit 2026-08-20
- **Avatar Zalo bạn bè/khách hàng hết hạn, không tự phục hồi** — `Friend.zaloAvatarUrl`/
  `Contact.avatarUrl` trước đây lưu thẳng URL Zalo CDN (tự hết hạn) thay vì mirror về S3 nội bộ
  như group avatar đã làm (`group-info-refresh.ts`). Áp dụng cùng cơ chế mirror cho
  friend-sync (`friend-sync-service.ts`), chỉ mirror khi CHƯA có bản nội bộ (tránh fetch lại
  mỗi 15 phút cho toàn bộ friend). Không đụng avatar sale đã tự upload tay.
- **Đồng bộ bạn bè fail âm thầm mỗi chu kỳ** — `getSentFriendRequests` (zca-js) throw mã lỗi
  112 khi đơn giản là KHÔNG có lời mời đang chờ (hành vi bình thường của thư viện, không phải
  lỗi thật) — nhưng code cũ dùng chung 1 try/catch với `getAllFriends`, nên lỗi 112 huỷ luôn
  kết quả `getAllFriends` đã thành công. Giờ bắt riêng mã 112 = danh sách rỗng, lỗi khác vẫn
  bubble lên như cũ (giữ đúng tinh thần fix B4 trước đó — không nuốt lỗi thật).
- **Log lỗi ERROR liên tục vô ích mỗi 60s** — `getFriendOnlines` 404 (endpoint đã bị caller
  silent-fail sẵn) log ERROR mãi mãi không ai đọc. Hạ xuống debug, cùng cơ chế
  `suppressErrorLog` đã có cho lỗi malformed-JSON.
- **Toast "Máy chủ lỗi" sai bản chất ở nhiều chỗ khác** — mở rộng fix `skipErrorToast` (đã áp
  dụng cho OmiCall connect/sync trước đó) sang `resolve-conversation-target` (gọi ZCC), gán/sửa
  tag Zalo (`assign-thread`, PATCH label màu/tên) — các API này đã có toast lỗi riêng cụ thể,
  không cần toast chung chung đè lên.

### Added (4) — Full-system audit 2026-08-20
- **Rename Occupation → Industry** trên toàn bộ DB/API/UI/form/AI (migration
  `RENAME COLUMN`, giữ nguyên dữ liệu cũ) — theo đúng yêu cầu chuẩn hoá thuật ngữ.
- **Thêm `storeName` (Tên cửa hàng) và `customerType` (Đối tượng: Đại lý/Dự án/Cá nhân)**
  vào hồ sơ khách hàng — 2 cột mới, không ảnh hưởng dữ liệu cũ.
- **Trạng thái khách hàng (Status) đổi thành đúng pipeline bán hàng thật** (Mới → Đã liên hệ →
  Quan tâm → Báo giá → Đang follow → Chốt đơn → Không tiềm năng/Chuyển sale/Đã mua hàng/Ngừng
  kinh doanh), thay placeholder generic cũ (Mới/Đã liên hệ/Quan tâm/Chuyển đổi/Mất). Dữ liệu cũ
  (`converted`/`lost`) được remap sang giá trị tương đương gần nhất, không mất dữ liệu.
- **Hạng khách hàng (A/B/C/D) và Độ ưu tiên (Rất cao/Cao/Bình thường/Thấp)** — hiển thị dạng
  badge trên hồ sơ khách hàng, tính TỰ ĐỘNG từ `leadScore`/`priorityScore` đã có sẵn (không phải
  field riêng, không trùng hệ thống chấm điểm) — hiện thực hoá đúng placeholder `auto_score` đã
  khai báo sẵn trong `TagSource` nhưng chưa ai code.
- **Gợi ý Tỉnh/Huyện/Xã khi nhập địa chỉ** — autocomplete dựa trên dữ liệu ĐÃ CÓ thật trong
  chính hệ thống (không dùng dataset hành chính tĩnh — dễ sai/lỗi thời khi tỉnh huyện sáp nhập),
  vẫn cho gõ tự do. Endpoint mới `GET /contacts/address-suggestions`, cùng pattern với
  `/contacts/sources` có sẵn.

### Fixed (2)
- **Toast "Máy chủ lỗi, vui lòng thử lại" sai bản chất khi nhân viên chưa có extension** —
  `GET /telephony/omicall/connect-config` và `POST /telephony/omicall/sync` trả 503 khi
  nhân viên chưa được gán extension tổng đài (trạng thái nghiệp vụ bình thường, có message
  cụ thể: "Bạn chưa được gán extension tổng đài — liên hệ quản trị viên"), nhưng interceptor
  axios chung coi MỌI status ≥500 là lỗi server thật và đè lên bằng toast chung chung, khiến
  nhân viên tưởng hệ thống bị crash thay vì hiểu đúng là "chưa được cấp quyền gọi". Sửa: thêm
  cờ `skipErrorToast` cho 2 request này (UI đã tự xử lý message cụ thể qua `errorMessage`).
- **Nhân viên tạo trước khi có tính năng auto-provisioning bị kẹt, không gọi được** — thêm
  `POST /api/v1/users/:id/omicall-auto-provision` (owner/admin) để backfill extension OmiCall
  cho nhân viên cũ, dùng lại đúng logic `provisionOmicallAgent()`. Nút "☎️ Tự động cấp extension
  OmiCall" xuất hiện trong `UserEditPanel.vue` khi nhân viên chưa có extension. Đã test thật:
  backfill cho 1 nhân viên thật (tạo trước khi có tính năng này) → OmiCall trả extension thật,
  đăng ký SIP thành công (status "connected").

### Added
- **AI Chatbot: đọc file PDF/DOCX** — endpoint `POST /api/v1/ai/chatbot/documents/upload` giờ nhận
  và trích xuất text thật từ PDF (`pdf-parse`) và DOCX (`mammoth`) thay vì chỉ TXT/MD/CSV/JSON.
  File không đọc được (hỏng, có mật khẩu) trả lỗi rõ ràng thay vì nạp rác nhị phân vào knowledge base.

### Changed
- **AI Trợ Lý Virtual Chat: chuyển domain BĐS → Điện mặt trời** — prompt mẫu, schema trích xuất
  (`ExtractedSolarNeed`: loại công trình, tiền điện, mái, công suất, hệ thống hoà lưới/độc lập...)
  và UI gợi ý (`AiSuggestionCard.vue`) đổi theo nghiệp vụ điện mặt trời. `propertyNeed` BĐS cũ giữ lại
  làm fallback cho dữ liệu lưu trước đây, không mất dữ liệu.

### Fixed
- **AI Trợ Lý Virtual Chat:** khi model AI quên phần reply text trước `---JSON---`, hệ thống trước đây
  hiện nguyên khối JSON kỹ thuật (confidenceScore, missingFields...) vào tin nhắn cho sale xem — giờ
  bỏ qua tin đó thay vì hiển thị nội dung không phù hợp.
- **AI Trợ Lý Virtual Chat:** các trường số (tiền điện, diện tích mái, công suất kWp...) bị model AI
  trả về dạng chuỗi (`"100"` thay vì `100`) trước đây bị âm thầm loại bỏ — giờ tự động ép kiểu trước
  khi kiểm tra hợp lệ, không mất dữ liệu đã trích xuất đúng.

### Added (3)
- **Auto-provisioning OmiCall khi tạo nhân viên** — `telephony/omicall-agent-provisioning.ts` gọi
  `POST /api/agent/invite` (OmiCall Employee API) ngay khi admin tạo user qua
  `POST /api/v1/users/create-with-zalo`, tự cấp `sip_user`/`sip_password` thật (mã hoá lưu vào
  `User.omicallExtension`/`omicallExtensionSecret`) — nhân viên gọi được ngay, KHÔNG cần admin
  gán extension thủ công. Mọi user mới mặc định `role_name: "Sale"` (chưa map theo role CRM thật).
  Nếu identify_info trùng (`agent_exists`), tự tra `GET-by-email` và gán lại extension đã có thay vì
  fail. Best-effort — nếu OmiCall lỗi/không cấu hình, việc tạo user vẫn thành công bình thường, chỉ
  báo rõ trên UI (`CreateUserWithZaloModal.vue`) rằng cần gán extension thủ công.

### Added (2)
- **OmiCall → crm-custom relay** — khi 1 cuộc gọi OmiCall kết thúc (completed/rejected/missed/failed),
  `telephony/omicall-crm-forward.ts` chuyển tiếp sang webhook-endpoints của `crm-custom`, để cuộc gọi
  cũng vào `CallLog` bên đó (tự chuyển trạng thái Lead + AI tóm tắt). Bắn từ 2 nơi: (1) webhook trực
  tiếp `omicall-public-routes.ts` khi có địa chỉ public nhận webhook thật từ OmiCall, và (2)
  `omicall-history-sync.ts` — đường kéo lịch sử qua Call Transaction API, dùng được ngay trên local
  vì không cần OmiCall gọi ngược vào máy mình. Tùy chọn — tắt nếu không cấu hình
  `CRM_CUSTOM_OMICALL_WEBHOOK_URL`/`_SECRET`. Không sửa gì bên `crm-custom` (dùng lại webhook-endpoints
  framework có sẵn).
  **Đã test thành công bằng dữ liệu thật** qua tài khoản OmiCall trial: sync 1 cuộc gọi outbound thật
  (9s, đã trả lời, có link ghi âm thật từ OmiCall) → xuất hiện đúng trong `CallLog` bên crm-custom,
  số điện thoại/thời lượng/hangup cause/disposition/link ghi âm đều khớp chính xác.

### Security
- `.gitignore` mở rộng để chặn commit nhầm `.env.production` (trước đây chỉ chặn đúng file `.env`).
- Toàn bộ secret tự sinh trong `.env.production` (JWT, ENCRYPTION_KEY, TOKEN_ENCRYPTION_KEY,
  DB password, webhook verify token FB/Zalo/Omicall) đã được rotate — không còn giá trị mặc định.
- *(Chưa xử lý, chờ xác nhận riêng — xem `OMICALL-INTEGRATION-DISCOVERY-PHASE0.md` mục 11):*
  `UserSipConfig.sipPassword` (crm-custom) lưu plaintext; route `telephony` (zalo-crm-solar) chưa
  dùng `requireGrant()`; webhook OmiCall xác thực qua `?key=` query string thay vì chỉ header.

## [3.4.0] - 2026-06-20

Đợt cập nhật lớn: **giao diện mới** + **Dashboard mới**, **nâng cao bảo mật**, **quét nhóm Zalo**, **bộ báo cáo mới**, **cầu Zalo ↔ Telegram**, **độ tin cậy chat**, và chuyển sang **mã nguồn mở AGPL-3.0**.

### Added — Tính năng mới
- **Giao diện mới** — redesign toàn diện UI (layout, theme sáng/tối, responsive desktop/mobile).
- **Giao diện Dashboard mới** — trang điều hành thiết kế lại, biểu đồ + KPI trực quan hơn.
- **Nâng cao bảo mật** — access token ngắn + **refresh token rotation**, CSP + security headers, RBAC phòng ban/đội nhóm, audit log, Privacy PIN.
- **Quét nhóm Zalo** — quét nhóm & danh sách thành viên (GroupMember/GroupScan) bằng worker nền, trong menu Marketing.
- **Bộ báo cáo mới** — Tổng quan điều hành · Vận hành Nick Zalo · Hiệu suất Sale & Team · Tương tác khách hàng · Audit & Sức khoẻ hệ thống · **Phân tích nâng cao**.
- **API hoàn chỉnh cho ZCRM Mobile App** — bộ REST API đầy đủ (auth, chat, contacts, lịch hẹn, báo cáo, push) phục vụ ứng dụng di động.
- **Cầu Zalo ↔ Telegram** — mirror tin nhắn **2 chiều** (vào/ra) + **media** (ảnh/video/audio/file, giữ tên file gốc), realtime + badge, chống lặp theo `msgId`.
- **Chuông "đang theo dõi"** sau tên khách ở cột 2 chat (đồng bộ 3 nơi).
- **Chat "Phạm vi làm việc":** scope trở thành điều kiện LOAD; mỗi lần gắn 1 card + nhóm "đã xong" thu gọn.
- **Template:** mở rộng 8 biến cá nhân hóa.
- **AI:** quản lý API key + model provider trên giao diện (per-org).
- **Media:** hiển thị nguồn nick/sale + metadata + bảng review tag khi gửi.
- **API:** Public REST API (X-API-Key) + tài liệu API (vi/en + Postman collection).

### Changed — Thay đổi / Giao diện
- **Giấy phép → AGPL-3.0:** relicense sang GNU AGPL-3.0 (copyleft + §13 SaaS source-disclosure) + **dual-license thương mại** + điều khoản **trademark "ZCRM"**; SPDX header trên toàn bộ file nguồn; thêm CONTRIBUTING + DCO; link **"Mã nguồn"** ở trang login (tuân thủ §13).
- Hồ sơ KH dùng tag per-nick (TagV2); nút Hồ sơ ở trang Bạn bè mở popup.
- Bộ nhận diện ZCRM mới (logo monochrome, design system) + user guide + quick start (quản trị/nhân viên).

### Fixed — Sửa lỗi
- **clamav** image tag `1.3` → `1.4` (tag 1.3 không tồn tại trên Docker Hub).
- **Build:** sửa `@import` CSS trỏ sai sau khi di chuyển `airtable.css` (chỉ lộ ở `vite build`).
- **Privacy:** chặn blur `▒` ăn vào data — tên KH không bị ghi đè bằng `▒▒▒▒`.
- **Chat:** bấm avatar/tên KH báo "Không tải được thông tin user" (per-account UID); badge "tin ở nick khác" gọn 1 dòng.
- **Gửi tin (advance):** toast đỏ → vàng + báo đúng lý do; sửa báo "đã gửi" sai khi tin chưa đi + promote nhầm job mồ côi.
- **Realtime/Socket:** tự hồi socket khi treo lâu (token 15' hết hạn).

---

## Lịch sử upstream (locphamnguyen/ZaloCRM)

## v3.3.4 — 06/06/2026

> Bản phát hành tài liệu — không thay đổi code runtime. Bổ sung tài liệu kiến trúc, API và thiết kế tích hợp TCRM.

### Added

- **Tài liệu kiến trúc source code** (`docs/system-architecture.md`): sơ đồ tổng quan Frontend ↔ Backend ↔ dịch vụ ngoài, luồng khởi động `app.ts`, 20 module nghiệp vụ, kiến trúc Plugin Host (13 core plugin), `ZaloAccountPool`, webhook OUTGOING — kèm 8 sơ đồ Mermaid.
- **Tài liệu kiến trúc database** (`docs/database-architecture.md`): 64 model, mô hình danh tính Zalo 3 lớp (`ZaloAccount ↔ Friend ↔ Contact`), ER diagram lõi, phân nhóm 8 miền, vòng đời dữ liệu khi có tin nhắn.
- **Tài liệu API đầy đủ** (`docs/api-documentation.md` + bản tiếng Việt `docs/api-documentation-vi.md`): 19 nhóm endpoint, xác thực JWT, rate limit, webhook & WebSocket events.
- **Postman collection** (`postman-collection.json`): document chi tiết cho cả 19 nhóm; request **Login** tự lưu `token → {{TOKEN}}`, `orgId`, `userId`; hướng dẫn lấy `{{CONVERSATION_ID}}` và `{{ZALO_ACCOUNT_ID}}`.
- **Thiết kế tích hợp TCRM** (`plans/260605-2128-tcrm-webhook-receiver/`): nhận tin nhắn Zalo real-time qua webhook `message.received`, map qua `conversationId` + `senderUid`, idempotency theo `messageId`. Xác nhận ảnh/file đẩy được ngay MVP — URL media đã mirror sẵn vào `content` và public tải được (`docker-compose.yml` đặt bucket `anonymous download`).
- **Tài liệu hướng dẫn agent** (`CLAUDE.md`, `AGENTS.md`) và skill GitNexus (`.claude/skills/gitnexus/`).

## v3.3.3 — 28/05/2026

### Fixed

- **Tag Zalo Native không push qua Zalo SDK**: TagCrmBar khi user pick tag `managedBy='zalo_sync'` chỉ ghi vào `Contact.tags` qua `PUT /contacts/:id/tags` — không gọi Zalo SDK. Reload mất tag vì display logic chỉ lấy "🔵 X" từ `Friend.crmTagsPerNick`. Fix: route Zalo tags qua `POST /zalo-accounts/:id/labels/assign-thread` để push thật qua SDK, single-select per thread, null = unassign.
- **Filter tag Zalo Native trong sidebar lọc sai (0 kết quả)**: backend dùng pattern Prisma sai `zaloLabels: { path: ['$[*].name'], array_contains: [name] }` → silently trả 0 rows. Đổi sang `zaloLabels: { array_contains: [{ name }] }` (translates `jsonb @>` containment). Áp dụng cho cả filter `zaloLabels` riêng và filter `tags` thống nhất.
- **Tag Zalo Native không hiển thị trên conversation list + tag-crm-bar**: sync logic chỉ add mirror "🔵 X" cho `addedLabels` diff. Legacy data: friend có `zaloLabels` từ trước → sync lại thấy `addedLabels=[]` → không backfill mirror → 41/74 friends bị empty `crmTagsPerNick`. Fix: rebuild mirror from scratch mỗi sync — strip toàn bộ "🔵 ..." cũ, add lại cho TẤT CẢ labels hiện tại. Idempotent + self-healing. Kèm SQL backfill 74 friends.
- **Trang `/settings/rbac/users` thiếu nút "Thêm nhân viên"**: RBAC redesign vô tình bỏ nút tạo từ `UserManagement.vue` cũ. Khôi phục nút ở góc phải hero (owner/admin only) + dialog tạo nhân viên (họ tên, email, mật khẩu, vai trò). Dùng `useUsers().createUser` có sẵn.

## v3.3.2 — 28/05/2026

### Fixed
- **Ngắt kết nối nick Zalo không hiệu lực**: thêm `manuallyDisabled` Set trong `ZaloAccountPool` để chặn auto-reconnect sau khi user chủ động disconnect. `onDisconnected` callback và `autoReconnect` đều skip nếu account đã bị disable thủ công. Health check cron 5p + daily refresh + startup reconnect đều filter `status: 'disconnected'` và `archivedAt: null`.
- **Uptime 7d luôn 0%**: bảng `zalo_account_status_log` chưa được apply migration → tạo migration mới + backfill open record cho nick đang connected. Checkpoint cron 5p reconcile drift sau crash.
- **Tin nhắn của nick đã xoá vẫn hiển thị trong /chat**: filter `zaloAccount.archivedAt: null` trong conversations list + counts endpoints.
- **Drawer Chi tiết nick vẫn mở sau khi xoá nick**: tự đóng drawer sau khi xoá thành công.
- **AI Format button không hiện khi paste text**: tách button ra ngoài format toolbar (mặc định ẩn), luôn hiện ở góc phải trên editor khi có text.

### Added
- **Soft-delete nick CRM với 2 mode**:
  - TH1 (không check): chỉ ẩn nick khỏi quản lý, giữ session+zaloUid+data. Quét QR lại → auto-restore nick cũ với toàn bộ chat history.
  - TH2 (check "Xoá toàn bộ dữ liệu..."): clear session+zaloUid, quét QR lại tạo nick CRM mới.
  - Migration `20260528160000_add_zalo_account_archived_at` thêm cột `archived_at` + `purged`.
- **Auto-restore archived account** trên `loginQR`: khi `zaloUid` trùng với nick archived (purged=false) → unarchive + xoá nick tạm + chuyển pool instance.
- **Realtime status refresh**: thêm `onStatusChange` callback trong `use-zalo-accounts` để dashboard `fetchStats()+fetchEnriched()` ngay khi `zalo:connected/disconnected/error/reconnect-failed`.
- **Nick row actions trong chat folder picker**: 4 nút SVG (Sync danh bạ, Sync lịch sử chat, Reconnect, Đăng nhập QR) bên cạnh mỗi nick. Disable theo trạng thái live.
- **Toast notifications thống nhất**: `ToastContainer` chuyển sang góc trên phải, nền trắng + viền trái màu, icon + nút đóng (success/error/warning/info). Áp dụng cho sync danh bạ, sync lịch sử, xoá nick, mọi action errors.

### Changed
- Disable button theo trạng thái nick:
  - Reconnect + Đăng nhập QR: mờ khi `connected`
  - Ngắt kết nối: mờ khi không `connected`
  - Sync lịch sử chat: mờ khi không `connected`
- Backend `DELETE /api/v1/zalo-accounts/:id?purge=true|false` thay vì hard-delete.
- `zalo-scope.ts` filter `archivedAt: null` → nick archived ẩn khỏi mọi dashboard query (org admin + member).

### Dependencies
- Thêm `exceljs` vào frontend (fix build error sau khi remove `xlsx` từ v3.3.1).

## v3.3.1 — 28/05/2026

### Security

- **CRITICAL** Sửa SQL injection trong custom analytics report — `filters.source`/`filters.userId` từ request body bị concat thẳng vào `$queryRawUnsafe`, cho phép UNION-based extraction cross-tenant. Chuyển sang `prisma.$queryRaw` tagged template + `Prisma.sql` bound parameters.
- **CRITICAL** Nâng cấp `fast-jwt` lên 6.2.4 (vá CVE crit-header bypass) và 18 dependency backend khác qua `npm audit fix`. Frontend audit giảm từ 7 → 2 vuln.
- **HIGH** Bắt buộc xác thực trên các endpoint Zalo PII (`/api/v1/zalo-user-info/batch`, `/api/v1/zalo-user-info/:uid`, `/api/v1/zalo-sticker-list`) — trước đây không cần token, cho phép liệt kê số điện thoại/ngày sinh hàng loạt. Giới hạn batch từ 200 → 50 UID.
- **HIGH** Thêm SSRF guard cho webhook URL do org admin cấu hình (`modules/api/webhook-service.ts`) — chặn loopback, RFC1918, link-local (169.254/16), IPv6 ULA/link-local, non-HTTPS. Shared util `ssrf-guard.ts` cũng thay thế regex inline trong `zapier-webhook.ts`.
- **HIGH** Sửa IDOR và email enumeration oracle trong user-routes — member có thể tự đổi `email`/`teamId` của mình để chiếm password-reset. Thêm per-role field allowlist: member chỉ sửa `fullName`; admin thêm `email`+`teamId` (không tự sửa email); owner thêm `role`+`isActive`. Lỗi unique constraint trả về message chung, không lộ email tồn tại.
- **HIGH** Thay thế `xlsx` (SheetJS community, GHSA-4r6h-8v6p-xvw6 prototype pollution + ReDoS, không có bản vá) bằng `exceljs` trong modal import danh sách khách hàng. Lazy-import để giữ bundle nhỏ.
- **HIGH** MinIO: hard-fail khi thiếu `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` trong `.env` thay vì fallback về `minioadmin/minioadmin`.

### Hygiene

- Thêm `.env.bak*` và `.env.*.bak` vào `.gitignore` — ngăn commit nhầm file backup env.

### Upgrade notes

Thêm vào `.env` trước khi `docker compose up`:
```
MINIO_ROOT_USER=<admin-user>
MINIO_ROOT_PASSWORD=<strong-password>
```

## v3.3.0 — 25/05/2026

### Added
- Chuyển tiếp media trong chat: image, video, audio.
- Backfill/mirror ảnh/video inbound từ Zalo CDN sang MinIO/S3/R2.
- Cloudflare R2 config trong `.env.example`.
- Release screenshots tại `docs/release-images/v3.3/`.

### Changed
- Merge upstream `locphamnguyen/main` qua branch `merge/upstream-main-20260525`.
- Chat media pipeline dùng object storage nhất quán hơn cho preview và forward.
- `.env` parser xử lý secret/password có ký tự `#`.

### Fixed
- Fix issue #24: fallback JSON lỗi từ `getFriendOnlines`.
- Fix issue #25: nhận diện message type `webchat`.
- Fix thumbnail video không hiện.
- Fix kéo thả file/hình/video vào màn hình chat bị mất.
- Fix ảnh khách gửi đến còn lưu trực tiếp Zalo CDN thay vì mirror về object storage.

## v3.2.0 — 21/05/2026

### Added
- Lead Scoring Phase 6: signal detector, auto-decay, auto tags, stuck lead dashboard.
- Scoring settings tại `/settings/crm/scoring`.
- Scripts hỗ trợ Phase 7 runner và setup test data.

### Changed
- Appointments, Friends, Zalo Accounts, Settings layout được redesign.
- Zalo Labels auto-sync khi connect/reconnect.
- Contact touch-profile endpoint bổ sung thông tin từ SDK khi mở conversation.

## v3.1.2 — 04/2026

### Fixed
- Sửa lỗi nhỏ sau v3.1 về đồng bộ, UI và ổn định listener.
- Cải thiện backfill DM history và xử lý duplicate contact.

## v3.1.1 — 04/2026

### Fixed
- Sửa lỗi phát sinh trong luồng tag/note/label.
- Cải thiện fallback AI parse khi quota provider bị giới hạn.

## v3.1.0 — 04/2026

### Added
- CRM Tag system riêng trong Settings.
- Notes thread trong hồ sơ khách hàng.
- Zalo Labels 2-way sync.
- DM history backfill endpoint và nút đồng bộ trong UI.
- DuplicateReviewDialog để rà soát/gộp khách hàng trùng.

### Changed
- Phone normalization theo `phoneNormalized`.
- Contact resolving ưu tiên key chuẩn hơn.

## v3.0.0 — 2026

### Added
- Chat attachments qua MinIO/S3: hình ảnh, video, file.
- Video player inline trong bubble.
- Friend model và FriendshipAttempt.
- Reaction multi-emoji đồng bộ hai chiều Zalo ↔ CRM.
- Sticker animated render qua proxy.
- Bank/QR card render theo style Zalo.
- Zalo user info popup.
- Contact merge theo Zalo globalId.
- Proxy per-account UI.

### Changed
- Redesign Chat, Contacts, Friends theo Smax style.
- Bổ sung Redis và object storage vào stack Docker.

### Fixed
- Fix duplicate message do shape `sendResult.message.msgId`.
- Fix image preview rỗng sau upload attachment.
- Fix reply preview attachment hiện raw JSON.
- Fix mention tô lố vùng text.

## v2.1 — 16/04/2026

### Added
- Tab "Khác" cho hội thoại không quan trọng.
- Tên khách hàng 2 lớp: CRM Name + Zalo Name.
- Bộ lọc hội thoại: chưa đọc, chưa trả lời, thời gian, tag.
- Quick template bằng phím `/`.
- Đồng bộ 50 tin nhắn cũ và selfListen dedup.

### Fixed
- Fix tên "Unknown".
- Fix PWA setup.
- Fix tin nhắn trùng khi gửi.

## v2.0.0 — 31/03/2026

### Added
- AI Assistant: gợi ý trả lời, tóm tắt, phân tích cảm xúc.
- Integration Hub: Google Sheets, Telegram, Facebook, Zapier.
- Mobile PWA.
- Contact Intelligence: gộp trùng, lead scoring, auto-tag.
- Advanced Analytics.
- Multi-provider AI: Anthropic, OpenAI, Gemini, Qwen, Kimi.
- Proxy per-account.

### Fixed
- Loại bỏ một số trường hợp tin nhắn hiển thị trùng.

## v1.0.0 — Khởi tạo

### Added
- Quản lý nhiều tài khoản Zalo cá nhân.
- Đăng nhập QR và tự reconnect.
- Chat real-time, gửi/nhận tin nhắn, ảnh, file, sticker, nhóm chat.
- Quản lý khách hàng theo pipeline.
- Lịch hẹn, dashboard, báo cáo Excel.
- Phân quyền Owner/Admin/Member.
- Public REST API và webhook.
- Chống block Zalo bằng giới hạn gửi và cảnh báo tốc độ.
- Tìm kiếm toàn hệ thống.
- Theme tối/sáng.
