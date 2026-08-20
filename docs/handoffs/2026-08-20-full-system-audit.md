# Handoff: Full-system audit + Phase 1 (bug fixes + safe foundation) + Phase 2 (hoàn tất phần khả thi)

Ngày: 2026-08-20
Trạng thái: Phase 1 hoàn tất. Phase 2 hoàn tất TOÀN BỘ hạng mục có thể làm an toàn trong phạm vi
audit gốc: calling core (CallNote, CallButton, dialer autocomplete, call stats), link/tạo KH từ
Call History, ghi chú mới nhất khi hover chat, import Excel/CSV, xuất Excel/CSV, phát ghi âm qua
cổng có auth, gọi lại được cuộc gọi nội bộ, nới validate SĐT, dead `tel:` links → gọi thật. Chỉ
còn 2 hạng mục CỐ TÌNH chưa làm (multi-carrier — chưa có provider thứ 2 thật; migrate Status
table — cần UI quản lý pipeline trước, chưa có) + 1 giới hạn không sửa được từ CRM (nguyên nhân
gốc ghi âm mono — phía OmiCall) — xem roadmap cuối file.

## Bối cảnh

Yêu cầu gốc bao trùm ~15 hạng mục: mở rộng hệ thống gọi điện (autocomplete số, universal call button, post-call actions, call notes riêng biệt), thống kê cuộc gọi, import Excel khách hàng, đổi tên Occupation→Industry, thêm storeName/classification, review birthYear/address, điều tra bug RBAC, điều tra lỗi "Server Error" chung chung, audit toàn bộ Zalo sync, fix avatar Zalo, và audit toàn hệ thống.

Do khối lượng quá lớn (nhiều hạng mục là dự án con — universal call button chạm 8+ file, import Excel là 1 pipeline mới hoàn toàn), đã thống nhất với anh chia làm 2 đợt:
- **Đợt 1 (đã làm — tài liệu này)**: audit toàn bộ + sửa bug đã xác nhận root cause + nền tảng schema an toàn.
- **Đợt 2 (roadmap, chưa làm)**: tính năng lớn — xem mục cuối.

## 1. Audit: hiện trạng vs yêu cầu

Audit chạy song song 4 hướng (calling/notes/stats, customer schema/import, RBAC/error-handling, Zalo sync/avatar). Tóm tắt:

| Hạng mục | Hiện trạng trước audit |
|---|---|
| Click-to-call | Chỉ hoạt động thật ở khung chat (`MessageThread.vue`). Contact list/profile/call-history đều KHÔNG gọi được (text thường hoặc `tel:` link rời khỏi CRM) |
| Dialer autocomplete | Không tồn tại |
| Post-call actions (note/link/tạo KH) | Không tồn tại |
| Call notes riêng cuộc gọi | Không tồn tại — model `Note` chỉ gắn `contactId`, không gắn `callId` |
| Call statistics | `TelephonyCall` KHÔNG được tính vào bất kỳ analytics/lead-score nào — hoàn toàn tách biệt |
| Multi-carrier | Hard-code `'omicall'` ở nhiều điểm ghi DB, không có abstraction |
| Import khách hàng | Chỉ có import cho List/lead-pool (phone+name+note), KHÔNG map được field Contact đầy đủ |
| Occupation | 1 cột string đơn giản, ~15 điểm tham chiếu (backend/frontend/AI) |
| birthYear/birthDate | **Cả 2 field đã tồn tại song song** — birthDate đã là date picker thật, birthYear là fallback khi chỉ biết năm (KHÔNG phải trùng lặp cần xoá — xem quyết định ở mục 3) |
| Classification | Không có Grade/CustomerType. Có sẵn `leadScore`/`priorityScore` (0-100) nhưng chưa bucket thành hạng. `TagSource.auto_score` đã khai báo nhưng chưa ai code |
| RBAC "bug" Zalo Edit | **Không phải bug** — `deptRole` (leader/deputy) chỉ mở rộng phạm vi XEM, `permissionGroup` mới quyết định quyền EDIT. Đây là thiết kế phân quyền có chủ đích, anh xác nhận giữ nguyên |
| Server Error chung chung | Xác nhận: nhiều API trả 503 cho trạng thái BÌNH THƯỜNG (chưa cấu hình/chưa kết nối) nhưng bị interceptor axios coi là lỗi 500 thật → toast sai bản chất |
| Zalo sync | Kiến trúc reconnect/circuit-breaker/sticky-hold rất chắc. Có 2 lỗi live xác nhận được (xem mục 2) |
| Avatar Zalo | Root cause xác nhận: Group avatar ĐÃ có fix (mirror CDN→S3), Friend/Contact avatar thì CHƯA — dùng thẳng URL Zalo CDN (tự hết hạn) |

## 2. Đã fix (bug thật, đã xác nhận root cause)

1. **Avatar Zalo bạn bè hết hạn không tự phục hồi** — `backend/src/modules/zalo/friend-sync-service.ts`: áp dụng `mirrorRemoteMediaUrl()` (đã dùng cho group avatar) cho Friend/Contact avatar, chỉ mirror khi chưa có bản nội bộ.
2. **`getSentFriendRequests` mã lỗi 112 huỷ nhầm cả `getAllFriends` đã thành công** — tách try/catch riêng, mã 112 = danh sách rỗng (không phải lỗi), giữ nguyên hành vi bubble-error cho lỗi thật khác (đúng tinh thần fix B4 trước đó).
3. **`getFriendOnlines` 404 log ERROR vô ích mỗi 60s** — `backend/src/shared/zalo-operations.ts`: hạ xuống debug qua `suppressErrorLog`.
4. **Toast "Máy chủ lỗi" sai ở nhiều API trả 503 cho trạng thái bình thường** — mở rộng `skipErrorToast` (đã áp dụng cho OmiCall connect/sync phiên trước) sang: gọi ZCC (`resolve-conversation-target`), gán/sửa tag Zalo. Các API còn lại có 503 nhưng KHÔNG có caller/UI xử lý riêng thì để nguyên (tránh nuốt mất feedback duy nhất người dùng có).

**Chưa fix (cần điều tra thêm, KHÔNG blind-fix)**: `zalo-message-sync.ts` group-history 404 — nghi ngờ zca-js/Zalo API drift, chưa xác nhận được qua network trace, đồng thời code này bypass `zaloOps.exec()` (đổi vào sẽ rủi ro hơn cần cân nhắc riêng.

## 3. Đã thêm (nền tảng an toàn, không phá dữ liệu cũ)

- **Rename Occupation → Industry** toàn bộ DB/API/UI/AI (migration `RENAME COLUMN`, giữ data). Xem `backend/prisma/migrations/20260820100000_contact_industry_rename_and_classification/`.
- **`storeName`, `customerType`** (Đại lý/Dự án/Cá nhân) — cột mới, optional.
- **Status pipeline thật** — `frontend/src/composables/use-contacts.ts` `STATUS_OPTIONS` đổi từ 5 bước generic sang đúng 10 bước thật (Mới→...→Đã mua hàng/Ngừng kinh doanh) theo file Excel anh cung cấp. Data cũ (`converted`/`lost`) đã remap sang tương đương gần nhất qua migration `20260820100100_contact_status_pipeline_remap`.
- **Grade (A/B/C/D) + Priority (Rất cao/Cao/Bình thường/Thấp)** — `backend/src/modules/contacts/score-tiers.ts`, hàm thuần bucket từ `leadScore`/`priorityScore` có sẵn, KHÔNG lưu field riêng (đúng yêu cầu "tái dùng, không tạo hệ chấm điểm trùng"), hiện badge trên hồ sơ KH.
- **Gợi ý địa chỉ** — endpoint mới `GET /contacts/address-suggestions` trả tỉnh/huyện/xã ĐÃ CÓ thật trong data org (KHÔNG dùng dataset hành chính tĩnh — rủi ro sai/lỗi thời khi sáp nhập tỉnh huyện). Field vẫn free text.
- **birthYear giữ nguyên** — audit ban đầu định gỡ vì tưởng trùng lặp với birthDate, nhưng phát hiện nó phục vụ use-case thật (hint sẵn trong code: "Nhập riêng năm nếu không có ngày đầy đủ") — sửa kế hoạch, KHÔNG gỡ.
- **Backfill provisioning + auto-provisioning OmiCall** (từ phiên trước, đã test thật) + fix bug 429 flood khi sync lịch sử cuộc gọi lặp lại forward cùng 1 cuộc gọi mỗi lần sync.

## 4. Test results

- `npx tsc --noEmit` (backend) + `npx vue-tsc --noEmit` (frontend): **PASS**, chạy lại sau mỗi nhóm thay đổi.
- `npx vitest run` (backend, 92 test files): 43 file/45 test fail — **xác nhận qua `git stash` đối chiếu baseline: TOÀN BỘ đã fail TRƯỚC KHI đụng vào code phiên này** (mock `tenantTransaction` thiếu, module `render-template.js` không tồn tại — nợ kỹ thuật cũ, KHÔNG phải regression từ đợt audit này). Đã xác nhận cụ thể `friend-sync-service.test.ts`/`friend-sync-cron.test.ts` (khu vực đụng nhiều nhất) fail giống hệt baseline (9 fail/5 pass cả trước và sau).
- Test file có đổi field (`virtual-chat-entities.test.ts`, `render-template-vars.test.ts`) đã cập nhật theo rename — `virtual-chat-entities.test.ts` chạy PASS (10/10); `render-template-vars.test.ts` fail do import module không tồn tại (lỗi có sẵn từ trước, không liên quan rename).
- Live verify qua Docker rebuild + curl + browser (như các đợt trước): connect-config, sync, auto-provision, dedup-forward đều xác nhận hoạt động thật trên OmiCall trial account thật.

## 5. Docs đã cập nhật

- `CHANGELOG.md` — mục Fixed/Added mới cho toàn bộ đợt này.
- File này (`docs/handoffs/2026-08-20-full-system-audit.md`).
- `D:\IT\OMICALL-PROVISIONING-AUDIT.md` (phiên trước, đã có ghi chú UPDATE).

## 6. Feature-status matrix (theo đúng format yêu cầu)

| Feature | Status | File chính | Ghi chú |
|---|---|---|---|
| Click-to-call (chat) | ✅ Working | `MessageThread.vue`, `use-omicall-softphone.ts` | |
| Click-to-call (call-history, hồ sơ KH, danh sách, panel bên) | ✅ Done | `CallButton.vue`, `CallHistoryView.vue`, `ContactDetailDialog.vue`, `ContactsView.vue`, `ContactDetailPanel.vue` | `CustomerProfileDialog.vue` bỏ qua — vẫn là view skeleton, phone chỉ có ô nhập |
| Dialer autocomplete | ✅ Done | `TelephonySoftphone.vue`, `GET /telephony/dial-suggestions` | Khớp tên/SĐT trong CRM, kèm trạng thái/thời gian cuộc gọi gần nhất |
| Post-call note/link/create | ✅ Done | `CallNotesPanel.vue`, `TelephonySoftphone.vue`, `AddCustomerQuickDialog.vue`, link-existing ở `CallHistoryView.vue` | Note + tạo KH mới + gắn KH có sẵn đều đã có |
| Ghi chú mới nhất hover chat | ✅ Done | `ChatContactPanel.vue`, `GET /telephony/contacts/:contactId/latest-call` | |
| Call notes (per-call) | ✅ Done | `CallNote` model, `telephony-routes.ts` | Chronological, newest-first, tách biệt Note chung. Chưa có ở: hover phone trong chat |
| Call statistics | ✅ Done | `team-performance.ts`, `TeamLeaderboard.vue` | Tổng cuộc gọi/đã nghe/tỷ lệ kết nối/TG gọi TB — tái dùng `TelephonyCall`, không tạo bảng riêng |
| Multi-carrier | ❌ Missing (by design) | — | Cố tình chưa làm — chỉ 1 provider thật (OmiCall), tránh over-engineer |
| Customer Excel import | ✅ Done | `contact-import-service.ts`, `ContactImportDialog.vue` | Upload → Mapping → Preview → Import → Result đầy đủ, dedup + validate trước khi ghi |
| Occupation→Industry | ✅ Done | Xem mục 3 | |
| storeName/customerType | ✅ Done | Xem mục 3 | |
| birthYear/birthDate | ✅ Đã đúng từ trước | `ContactDetailDialog.vue` | Giữ nguyên, không phải bug |
| Grade/Priority | ✅ Done | `score-tiers.ts` | Computed, không lưu field riêng |
| Address suggestions | ✅ Done | Xem mục 3 | Gợi ý, không ép cấu trúc |
| RBAC deptRole vs permissionGroup | ✅ Xác nhận không phải bug | `permission-group-service.ts` | Giữ nguyên theo yêu cầu anh |
| Generic 503→toast sai | ✅ Fixed (phần lớn) | `api/index.ts` `skipErrorToast` | Vài endpoint chưa có caller/UI riêng nên chưa đụng |
| Zalo avatar hết hạn | ✅ Fixed | `friend-sync-service.ts` | |
| Zalo friend-sync 112 false-fail | ✅ Fixed | `friend-sync-service.ts` | |
| Zalo group-history 404 | ⚠️ Chưa fix, đã flag | `zalo-message-sync.ts` | Root cause chưa xác nhận |
| Analytics status-pipeline regression | ✅ Fixed (tự phát hiện) | `team-performance.ts`, `conversion-funnel.ts`, `custom-report.ts` | Đổi `STATUS_OPTIONS` (đợt trước) làm 3 báo cáo này hard-code `status='converted'` cũ → sẽ hiện 0 mãi mãi nếu không sửa. Phát hiện + fix trong lúc thêm call stats |
| OmiCall auto-provisioning | ✅ Done (phiên trước) | `omicall-agent-provisioning.ts` | Đã test thật |
| Customer Excel/CSV export | ✅ Done | `contact-export-service.ts`, `contact-export-routes.ts` | Round-trip với import, RBAC scope giống `GET /contacts`, verify thật qua browser (click → 200) + curl (nội dung/header đúng) |
| Gọi lại số lịch sử/lạ/nước ngoài | ✅ Fixed | `use-omicall-softphone.ts`, `telephony-routes.ts` | Trước đây validate STRICT (84+11-12 digit) chặn nhầm — verify thật `POST /calls` với số nước ngoài + số 9-digit |
| Gọi lại cuộc gọi nội bộ (Call History) | ✅ Fixed | `CallButton.vue` (prop `peer`), `CallHistoryView.vue` | Verify thật qua browser: nút "Gọi Ms Thảo" enable, đúng tên |
| Dead `tel:` links | ✅ Fixed | `FriendsView.vue`, `ListDetailView.vue`, `LeadDetailPanel.vue`, `FriendsTable.vue` | Chuyển hết sang `callPhone()`/`callPeer()` qua softphone thật |
| Ghi âm — phát qua cổng có auth | ✅ Done | `GET /telephony/calls/:id/recording` | Trước đây phát thẳng URL kho không auth. URL kho thô vẫn còn phục vụ không auth (known limitation, xem roadmap) |
| Ghi âm — nguyên nhân "sale không nghe được" | ✅ Điều tra xong, root cause ngoài CRM | `omicall-recording.ts` | ffprobe thật 5 file → cả 5 MONO — không phải bug pipeline CRM (fetch→buffer thô, không xử lý kênh) |
| CSV parser (import) | ✅ Fixed | `use-spreadsheet-parser.ts` | State-machine RFC4180-ish, 9 test case dữ liệu Việt thật |
| Đồng bộ lịch sử cuộc gọi — 502 lặp lại | ✅ Fixed (phát hiện lúc verify) | `omicall-history-sync.ts` | Race giữa `pending` và `existing` cùng transactionId vỡ unique constraint — không phải do đợt sửa này, có từ trước, bắt được lúc verify E2E |
| OmiCall history-sync 429 flood | ✅ Fixed (phiên trước) | `omicall-history-sync.ts` | |

## Roadmap Phase 2

### Đã làm (2026-08-20, đợt 2)
- ✅ `CallButton.vue` — component gọi tái dùng, gắn vào Call History, hồ sơ KH (dialog + panel bên), bảng danh sách KH.
- ✅ `CallNote` model + API — ghi chú riêng từng cuộc gọi, chronological/newest-first, tách biệt `Note` chung.
- ✅ Post-call note ngay sau khi cúp máy (`TelephonySoftphone.vue`).
- ✅ Tạo khách hàng từ số lạ ở Call History + tự gắn `contactId` ngược vào CallLog.
- ✅ Dialer autocomplete — gõ tên/SĐT gợi ý theo CRM, bấm gọi thẳng.
- ✅ Call statistics vào `team-performance.ts`/`TeamLeaderboard.vue`.
- ✅ Fixed regression: 3 module analytics hard-code status pipeline cũ (phát hiện khi làm call stats).

### Đã làm (2026-08-20, đợt 3 — hoàn tất phần khả thi của Phase 2)
- ✅ "Gắn vào khách hàng có sẵn" ở Call History (`CallHistoryView.vue`) — tìm + chọn KH đã có, không chỉ "tạo mới".
- ✅ Ghi chú mới nhất khi hover SĐT trong khung chat (`ChatContactPanel.vue`).
- ✅ Import khách hàng Excel/CSV đầy đủ pipeline (`contact-import-service.ts`, `ContactImportDialog.vue`) — xem CHANGELOG.md để biết chi tiết edge case đã xử lý (Date object, dd/mm/yyyy, label→slug status/customerType).

### Đã làm (2026-08-20, đợt 4 — Calling, Export, Recording & Final Verification)
- ✅ Xuất khách hàng .xlsx/.csv (`GET /contacts/export`), cùng field/label/enum với Import, round-trip được, RBAC scope giống `GET /contacts`.
- ✅ Cổng auth cho ghi âm (`GET /telephony/calls/:id/recording`) — thay phát thẳng URL kho không auth; xử lý êm URL hết hạn/thiếu.
- ✅ Điều tra + xác định nguyên nhân "sale không nghe được ghi âm": ffprobe thật trên 5 file → CẢ 5 đều MONO — không phải bug code CRM, nằm ở phía OmiCall.
- ✅ Gọi lại được cuộc gọi nội bộ ở Call History (trước đây nút Gọi luôn tắt cho dòng kênh "Nội bộ").
- ✅ Nới validate SĐT (FE+BE) — chấp nhận số lịch sử/nước ngoài/9-digit mà trước đây bị chặn nhầm.
- ✅ `resolve-conversation-target` — audit + verify dữ liệu thật (0/64 hội thoại thiếu contact) xác nhận không phải bug đang chặn use case nào, giữ nguyên có chủ đích.
- ✅ Dead `tel:` links (FriendsView, ListDetailView, LeadDetailPanel×2) + FriendsTable thiếu nút gọi → tất cả chuyển sang `callPhone()`/`callPeer()` qua softphone thật.
- ✅ Fix parser CSV (state-machine, RFC4180-ish) + 9 test case dữ liệu tiếng Việt thật.
- ✅ Fix bug 502 lặp lại ở đồng bộ lịch sử cuộc gọi (`omicall-history-sync.ts`) — phát hiện lúc verify E2E qua console browser thật, không phải qua đọc code. Backend test suite sau fix = đúng 43 lỗi baseline, không regression mới.
- ✅ Verify E2E qua Browser tool thật (không chỉ typecheck/API test): nút gọi nội bộ enable + đúng tên, phát ghi âm qua blob auth (đúng duration khớp ffprobe), export click → network 200, import dialog mở đúng, sync 502 → 200 sau fix.
- ✅ Docker rebuild + redeploy 2 lần (đợt đầu + đợt fix sync bug), verify compiled dist qua `docker exec` grep trước khi tin, logs sạch (chỉ noise code 112 đã biết).

### Còn lại (cố tình chưa làm)
- Multi-carrier routing — chỉ làm khi có provider thứ 2 thật cần tích hợp, tránh xây abstraction cho tình huống giả định.
- Migrate `Contact.status` từ hardcoded array sang bảng `Status` per-org configurable (đang có sẵn nhưng chưa dùng, `status-migration.ts` cũng đang map theo enum CŨ — cần cập nhật `LEGACY_ENUM_MAP` nếu bật lại tính năng này) — cần thêm UI quản lý pipeline trước, chưa có.
- `zalo-message-sync.ts` 404 — cần network trace trực tiếp để xác nhận nguyên nhân trước khi sửa, không blind-fix.
- URL ghi âm thô (`/files/media/<hash>.mp3`) vẫn phục vụ không auth (route static dùng chung media library khác) — cổng auth mới là đường chính thức, nhưng chưa khoá triệt để route cũ (rủi ro phá vỡ diện rộng nếu khoá — cần namespace storage-key riêng cho ghi âm trước).
- Nguyên nhân gốc ghi âm mono (phía OmiCall) — cần liên hệ OmiCall support hoặc kiểm tra cấu hình dashboard, ngoài khả năng sửa từ CRM.
