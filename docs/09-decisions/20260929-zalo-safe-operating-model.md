# Zalo CRM — mô hình vận hành an toàn và lộ trình triển khai

**Ngày:** 2026-09-29
**Trạng thái:** `DECISION / IMPLEMENTATION IN PROGRESS`
**Phạm vi:** Zalo CRM Solar, nhiều người dùng trong một tổ chức, dữ liệu Contact/Conversation/Message và các luồng gửi qua Zalo.

## Bối cảnh đã xác minh

Local WSL Docker hiện có 1 tổ chức, 2 user active, 2 tài khoản Zalo, khoảng 4.000 Contact, 353 Conversation và 46.148 Message. App, PostgreSQL, Redis và MinIO đều healthy; năng lực tải nhiều user chưa được benchmark.

Bản Community hiện dùng `zca-js` cho Zalo cá nhân. Đây là client không chính thức, vì vậy các giới hạn nội bộ của CRM không thể được xem là quota hoặc cam kết an toàn của Zalo. Chạy cùng một nick trên CRM và Zalo Web/Desktop có thể làm phiên Web-class đá lẫn nhau.

## Quyết định nghiệp vụ

### 1. Tách kênh theo mục đích

- **Zalo cá nhân:** chat 1–1, nhận tin, trả lời hội thoại, thao tác thủ công có kiểm soát, **và gửi hàng loạt có kiểm soát** (broadcast — điều kiện bắt buộc bên dưới). Không còn là kênh "chỉ 1-1 tuyệt đối".
- **Zalo OA/OpenAPI/ZNS/ZBS:** kênh chung của công ty cho tin giao dịch, hậu mãi, thông báo lịch hẹn, đơn hàng, khuyến mãi, lịch nghỉ và chiến dịch quy mô lớn — vẫn là kênh ưu tiên cho truyền thông chính thức số đông, độc lập với Zalo cá nhân (xem Tranche 4 — **chưa triển khai**, khác hẳn broadcast cá nhân bên dưới).
- **Cập nhật chính sách 2026-10-01 (quyết định chủ sở hữu sản phẩm — thay thế lệnh cấm tuyệt đối trước đây):** cho phép broadcast có kiểm soát trên Zalo cá nhân. Tất cả điều kiện sau bắt buộc cùng lúc, không được bỏ bớt:
  1. Chỉ gửi cho người nhận có `friendshipStatus='accepted'` (đã kết bạn) **hoặc** `relationshipKind='chatting_stranger'` (đã từng nhắn qua lại) — **tuyệt đối không** gửi cho quan hệ `none`/`ghost` (chưa từng liên hệ, không có bằng chứng tương tác).
  2. Phải kiểm tra `consentStatus` của từng người nhận — bỏ qua (skip, không gửi) người đã `revoked` (opt-out).
  3. Danh sách người nhận **cố định** tại lúc tạo chiến dịch — không random outreach, không tự mở rộng theo bộ lọc chạy lúc gửi.
  4. 1 chiến dịch broadcast chỉ dùng đúng **1 nick** — không rải nhiều nick trong cùng 1 chiến dịch.
  5. Quota riêng, tách khỏi quota tin nhắn tổ chức trả lời khách (xem Tranche 2); tự động pause khi hết quota, gặp 429 hoặc session lỗi — không tự ý retry.
  6. Có kill switch theo nick — admin tạm dừng gửi bất cứ lúc nào mà không cần ngắt kết nối nick.
  7. Gate bằng RBAC resource `broadcast` — không phải mọi user đều tạo được chiến dịch.
  8. **Không tự động kết bạn hàng loạt** — broadcast không kèm auto-add friend; kết bạn vẫn là thao tác đơn lẻ, thủ công, có cooldown (Tranche 1).
  9. Trước khi dùng cho khách hàng thật, người vận hành phải tự test bằng contact/nick thật của chính mình.
- **Vẫn giữ nguyên lệnh cấm còn lại:** random outreach (gửi tới danh sách chưa qua xác nhận/duyệt) và auto-kết bạn hàng loạt trên Zalo cá nhân — hai việc này KHÔNG nằm trong phạm vi broadcast được phép ở trên.

Mọi chiến dịch phải xác định loại tin, điều kiện người nhận, template, consent/opt-out, quota và người phê duyệt. Chính sách chính thức cần được kiểm lại trước mỗi thay đổi provider; tham khảo [chính sách tin OA](https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099) và [Campaign Tool OA](https://oa.zalo.me/home/resources/library/ra-mat-cong-cu-gui-tin-theo-chien-dich-tren-oa-manager_6425225596157316123).

### 2. Dữ liệu và identity

- `Contact` là hồ sơ CRM tổng hợp; `Friend` là quan hệ theo từng nick Zalo; `Conversation/Message` là lịch sử theo kênh.
- Không tự coi cùng số điện thoại/UID ở hai nick là cùng một quan hệ provider nếu chưa có bằng chứng.
- Lưu consent, opt-out, blacklist, nguồn dữ liệu, thời điểm kiểm tra và kết quả gửi.
- Mọi route/write phải giữ `orgId`, owner, account ACL và privacy mode.

### 3. Gửi tin phải qua policy gate và queue

Luồng chuẩn:

```text
Chọn người nhận
→ phân loại kênh + loại tin
→ kiểm tra quyền/consent/follower/tương tác/blacklist
→ preview + gửi thử + approval
→ queue theo OA/nick và loại tin
→ quota atomic + worker tuần tự
→ gửi từng job
→ ghi kết quả/audit
→ pause khi 429, auth error, rejected tăng hoặc có tín hiệu bất thường
```

Rate-limit nội bộ chỉ là lớp bảo vệ phụ. Redis không được là điểm lỗi đơn của chat 1-1: khi Redis không sẵn sàng, CRM chuyển sang limiter in-process bảo thủ và ghi cảnh báo. Các queue/bulk job vẫn phải pause nếu không còn bộ đếm dùng chung để tránh vượt quota giữa nhiều worker.

### 4. Login và session

- CRM login dùng access token ngắn, refresh rotation và revoke.
- Zalo session phải mã hóa at-rest; không export credential mặc định.
- Một nick không đăng nhập đồng thời ở CRM và Zalo Web/Desktop.
- Nhân viên nghỉ việc phải revoke CRM session và thu hồi quyền nick/OA.

## Lộ trình triển khai theo tranche

### Tranche 0 — Baseline và test contract

- Chốt dữ liệu nghiệp vụ: user, phòng ban, owner nick, ACL, Contact, Friend, OA recipient.
- Viết test anonymous/forbidden/cross-org/cross-owner cho API nhạy cảm.
- Ghi lại runtime snapshot, migration status, backup và rollback point.
- Không gửi tin thật trong test tự động.

**Gate:** test scope pass, không có route mới tự ý bypass account/org scope.

### Tranche 1 — Chặn rủi ro outbound cá nhân

- Tách rõ `personal_manual_reply` khỏi `campaign/broadcast`.
- **Cập nhật 2026-10-01:** bulk-send trên account cá nhân KHÔNG còn bị chặn tuyệt đối — chỉ được phép đi qua đúng module `broadcast` (có đủ 9 điều kiện ở mục 1). Mọi đường gửi KHÁC ngoài module này (chat thường, API khác, script tay) vẫn PHẢI chặn bulk-send ở backend, không chỉ ẩn nút frontend.
- Friend request chỉ cho thao tác đơn lẻ, có quyền, có audit và cooldown.
- Đưa `RATE_LIMITED`, `NOT_CONNECTED`, `SESSION_EXPIRED`, `PROVIDER_REJECTED` thành trạng thái nghiệp vụ rõ ràng.

**Gate:** thử đồng thời nhiều user trên một nick; không request nào vượt policy gate.

### Tranche 2 — Queue và circuit breaker

- Queue theo `channelId/accountId`.
- Một worker active cho một nick; job có idempotency key.
- Quota check/reserve atomic; Redis lỗi thì chat thủ công 1-1 dùng fallback in-process; queue/bulk pause để không vượt quota giữa nhiều worker.
- Retry chỉ áp dụng cho lỗi mạng tạm thời; không retry auth/rejected/429 tùy tiện.
- Có kill switch theo chiến dịch, OA và nick.

**Gate:** restart worker, mất Redis, duplicate request, 429 giả lập và job chạy dở đều không gửi trùng.

**Đã triển khai bước đầu tại local (2026-09-29):**

- `zaloOps` và các đường gọi SDK trực tiếp đã chuyển sang `reserve()` trước outbound call.
- Reservation Redis là atomic theo nick + loại thao tác; mất Redis không khóa chat 1-1 mà chuyển sang limiter in-process bảo thủ. Queue/bulk vẫn phải pause khi không có bộ đếm dùng chung.
- Reservation có mã định danh và được hoàn lại khi provider từ chối chắc chắn; lỗi timeout mạng giữ reservation vì Zalo có thể đã nhận tin, tránh retry tạo tin trùng/spam.
- Các luồng text, media, forward video, scoring, OTP, public API và system notification đều có quota gate; system notification còn anti-spam theo từng đích.
- Test rate limiter kiểm tra burst, Redis fallback và kết quả Redis deny; toàn bộ backend hiện pass `73 files / 549 tests` (2026-10-01, đã gồm cả broadcast Phase 3a gửi ảnh + route-level test create/start/schedule), build TypeScript pass.
- Đây là guardrail nội bộ, không phải quota chính thức của Zalo. Rate-limit reserve/release là lớp bảo vệ chung cho MỌI outbound — không riêng broadcast.
- Quota reservation giờ có `release()` khi gửi thất bại dứt khoát (không release cho lỗi mạng tạm thời, tránh double-send) — sửa vấn đề reservation "ăn" quota cho lần gửi không thành công.
- **Kill switch theo nick (2026-09-30):** đã thêm `ZaloAccount.sendingPausedAt/Reason/ById` + `POST /api/v1/zalo-accounts/:id/pause-sending` và `/resume-sending` (admin/owner hoặc `ZaloAccountAccess.permission='admin'`). Khi bật, mọi outbound qua `zalo-operations.ts` bị chặn ngay (mã lỗi `SENDING_PAUSED`) mà **không cần disconnect** — vẫn nhận tin/friend event bình thường để điều tra. Có audit log (`ActivityLog` category `security`).
- **Broadcast cá nhân có kiểm soát — Phase 1+2, ĐÃ DEPLOY và ĐÃ NGHIỆM THU GỬI THẬT trên Full Docker (2026-10-01):** tái dùng schema có sẵn `AutomationBroadcast` + `Block` (không tạo bảng mới). Category quota riêng `campaign_message` (mặc định 50/ngày/nick, burst 5/60s — chỉnh được ở Quản lý nick Zalo, tách hẳn khỏi `message` 5000/ngày cho chat bình thường). Hàm gửi riêng `sendCampaignMessage()` (không dùng chung `sendMessage()`) để quota không lẫn. Nghiệm thu thật: tạo + chạy 1 chiến dịch qua API thật tới nick "Thy It" (đang `connected`) gửi cho contact nội bộ "Truyền File" (tiện ích gửi-file-cho-chính-mình của Zalo, không phải khách thật) — kết quả `state=completed, sent_count=1`, nội dung tin xác nhận đúng trong bảng `messages` (`sent_via='user_native'`, đi qua SDK Zalo thật). Chi tiết: `docs/13-handoffs/2026-09-30-broadcast-phase1.md`.
  - Cổng an toàn trong `broadcast-worker.ts`: chỉ gửi `friendshipStatus='accepted'` hoặc `relationshipKind='chatting_stranger'`; bỏ qua `consentStatus='revoked'`; hết quota ngày/kill switch → `state='paused'`; chỉ bị burst → tự chờ rồi gửi tiếp; nick mất kết nối → pause ngay; resume đúng từ `resumeCursor` (không gửi trùng).
  - Lịch gửi theo danh sách: chọn batch size, khoảng cách giữa các batch và thời điểm bắt đầu; Phase 1 vẫn chốt danh sách contact cố định tại lúc tạo, 1 chiến dịch = 1 nick.
  - Kill switch theo **chiến dịch**: có qua state machine `draft→running→paused→completed→cancelled` (route `pause`/`cancel` riêng cho từng broadcast) — đáp ứng đúng gate Tranche 2 "kill switch theo chiến dịch". Kill switch theo **OA** vẫn chưa áp dụng được (Tranche 4 chưa mở, không có OA để tắt).
  - RBAC: gate bằng resource `broadcast` đã có sẵn trong permission matrix. **Cập nhật 2026-10-01 — quyết định user:** mở rộng nhóm "Sale" từ chỉ-xem sang có `create+edit` (ngang "Sale Senior"/"Trưởng phòng") để chuẩn bị cho nhân viên kinh doanh dùng thử — tức **mọi nhân viên sale đều tự tạo/chạy được chiến dịch gửi hàng loạt thật**, không riêng quản lý. Đã verify áp dụng đúng qua `PATCH /api/v1/permission-groups/:id` (không sửa thẳng DB), nhóm "Sale" nay có `broadcast: {access, create, edit}`. **Rủi ro cần nhắc đội ngũ:** quota/kill switch vẫn chặn lạm dụng tự động, nhưng mở rộng số người bấm được = tăng khả năng gửi nhầm/ẩu dẫn tới khoá nick — khuyến nghị mỗi sale tự test bằng contact quen trước khi gửi khách thật.
  - Frontend Phase 2: `/marketing/broadcasts` — tạo chiến dịch (chọn nick, nội dung, tìm+chọn người nhận), xem tiến độ, bắt đầu/tạm dừng/huỷ. Verify bằng Playwright thật (ảnh chụp trước/sau), không chỉ đọc code.
  - **Phase 3a — gửi ảnh/album (2026-10-01, ĐÃ DEPLOY và ĐÃ NGHIỆM THU GỬI THẬT):** `attachmentAssetIds` (ID từ Kho media của chính org, server tự tra URL — không nhận URL trực tiếp từ client). Ảnh + text gộp thành 1 tin ảnh có caption (1 lần reserve quota/người nhận qua `sendCampaignImage()`, sibling tách khỏi `sendImage()`). Frontend có picker chọn/tải ảnh, verify bằng Playwright thật (Kho trả đúng ảnh thật, chọn/bỏ chọn, thumbnail hiện đúng). Nghiệm thu gửi thật qua nick "Thy It" → contact "Truyền File": `state=completed, sent_count=1`, `messages.content_type='image', sent_via='user_native'`. Chi tiết: `docs/13-handoffs/2026-09-30-broadcast-phase1.md`.
  - Giới hạn còn lại (cố ý, chưa phải thiếu sót): chưa gửi video/file qua chiến dịch, 1 broadcast = 1 nick (không rải nhiều nick), người nhận là danh sách cố định (chưa có bộ lọc động theo tag/status runtime), chưa A/B test. Xem `docs/13-handoffs/2026-09-30-broadcast-phase1.md` cho chi tiết triển khai.
  - **Đây vẫn chỉ là guardrail nội bộ CRM, không phải quota/cam kết chính thức của Zalo** — bật tính năng không có nghĩa là Zalo đảm bảo không khoá nick; vẫn phải theo đúng 9 điều kiện ở mục 1 và checklist vận hành.

### Tranche 3 — Credential/data hardening

- Mã hóa `ZaloAccount.sessionData` và các secret nhạy cảm.
- Chỉ account-admin được export/import; audit export/import và rate-limit 5 lần/15 phút. Không bắt nhập lại mật khẩu CRM ở mỗi thao tác vì gây cản trở vận hành; file vẫn chứa cookie phiên và phải được quản lý như secret.
- Bật `TENANT_GUARD_MODE=warn`, xử lý cảnh báo.
- Apply RLS trên staging, chạy negative cross-org suite, sau đó mới enforce.

**Gate:** restore DB vẫn đọc được session khi có key; không đọc được dữ liệu khác org; rotate key có kế hoạch.

**Đã triển khai bước đầu tại local (2026-09-29):**

- Session mới/import được lưu dưới envelope AES-256-GCM (`zalo-session-encrypted-v1`) bằng `ZALO_SESSION_ENCRYPTION_KEY` (mặc định fallback về `ENCRYPTION_KEY`). Khóa rollover Zalo tách riêng để không làm hỏng secret OmiCall/recording.
- Boot, auto-reconnect, health-check, reconnect route, bulk reconnect, credential export/import đều đi qua decoder chung.
- Session legacy vẫn được đọc để tránh làm mất kết nối; boot local đã migrate thành công `2/2` row có session sang encrypted envelope.
- Có test round-trip, legacy compatibility, tamper rejection và rollover key cũ → mới. Session dùng AES-256-GCM (bí mật + IV + auth tag), khóa đọc từ `ZALO_SESSION_ENCRYPTION_KEY`/`ENCRYPTION_KEY`; sai khóa hoặc bị sửa file sẽ không giải mã được. Export/import chỉ cho account-admin, giới hạn 5 lần/15 phút và audit; không bắt nhập lại mật khẩu CRM. Script `db:rotate-zalo-sessions` có dry-run mặc định, chỉ ghi với `--apply` và abort trước khi ghi nếu có session lỗi; production vẫn phải thực hiện rehearsal có backup/rollback.
- Local dry-run ngày 2026-09-29 đọc `2` session, lập kế hoạch xoay `2`, không ghi dữ liệu. Docker sau rebuild healthy, `/health` trả `200` và DB connected; log boot reconnect được `2` account mà không có lỗi giải mã session.

**Tenant/RLS verification hiện tại:** tenant guard smoke đã xác nhận `warn` log cảnh báo, `enforce` chặn query ngoài context và `withTenant` cho phép query. Preflight read-only `scripts/tenant-rls-preflight.sh` và script chuẩn bị role opt-in `scripts/prepare-tenant-app-role.sh` đã được thêm làm release gate. Policy file hiện sinh động theo các bảng thật có `org_id`; lần smoke đầu trên DB restore đã phát hiện danh sách tĩnh cũ tham chiếu `call_records` không tồn tại và đã được thay thế trước khi rollout. Local hiện vẫn dùng `crmuser` là `superuser=true/bypassrls=true`, chỉ có `3` bảng RLS và `3` policy đang bật; tenant guard/RLS runtime chưa được xem là staging/production proof và cờ `TENANT_GUARD_MODE`/`RLS_SET_CONFIG` vẫn tắt.

**RBAC telephony:** đã thêm resource `telephony`, action `access/create/edit/view_all`, gate cho các route OmiCall và test sanitization/default grants. Các nhóm mặc định mới có grant theo template; seed không tự sửa nhóm đã tồn tại để bảo toàn lựa chọn của admin. Nhóm custom chỉ có quyền khi admin tick cấp; webhook OmiCall public vẫn dùng xác thực webhook riêng. Cần chạy role matrix trên staging/production.

**Regression/runtime check 2026-09-30:** backend pass `68 files / 495 tests`, backend TypeScript và frontend production build đều pass; Docker app/DB/Redis/MinIO healthy và `/health` trả `200` với DB connected. Hai session Zalo đã lưu đều bị provider từ chối với `ZcaApiError: Đăng nhập thất bại`; đây được phân loại/persist là `session_expired`, log không lộ credential và UI hiển thị yêu cầu quét QR lại. Không tự reconnect cưỡng bức hoặc gửi tin thử. Muốn kiểm tra E2E Zalo thật phải đóng phiên Zalo Web/Desktop đang cạnh tranh rồi quét QR lại bằng tài khoản test.

### Tranche 4 — OA channel

*(Lưu ý: Tranche này là kênh Zalo OA/ZNS chính thức của công ty — KHÁC HẲN
broadcast cá nhân có kiểm soát đã mô tả ở mục 1 và Tranche 2. Trạng thái dưới
đây CHƯA đổi dù broadcast cá nhân đã triển khai.)*

- Xác định OA ID, gói dịch vụ, ZBS account, template và quyền admin/soạn nội dung.
- Tách bảng/identity OA khỏi account cá nhân.
- Mapping Tin Tư vấn/Giao dịch/Truyền thông/ZNS vào policy engine.
- Có preview, gửi thử nội bộ, approval và báo cáo chiến dịch.

**Gate:** test OA sandbox/test recipient; không đưa personal UID vào OA flow và ngược lại.

**Kết quả rà soát Community (2026-09-29):** schema và RBAC đã có khái niệm `AutomationBroadcast`, nhưng route/worker automation-marketing thuộc extension bundle và hiện không được đăng ký trong bản Community. Chưa có OA provider/identity/queue đã xác minh. Do đó trạng thái đúng là **chưa triển khai broadcast OA**; tuyệt đối không dùng default `zalo_user` của model để **giả làm kênh OA**. (Cập nhật 2026-10-01: `AutomationBroadcast.channel='zalo_user'` nay ĐƯỢC dùng thật cho broadcast cá nhân có kiểm soát ở Tranche 2 — đúng bản chất kênh cá nhân, không phải giả danh OA, nên không mâu thuẫn với câu trên.) Tranche này chỉ bắt đầu sau khi có OA/API chính thức, quyền quản trị và recipient test của công ty.

### Tranche 5 — Host readiness

- Deploy đúng image/commit đã pass local/staging.
- HTTPS/HSTS/CSP enforce, MinIO admin private, secret ngoài Git.
- Restore rehearsal database + media + config.
- Benchmark số user dự kiến, socket, DB pool, Redis, media và queue.
- Monitoring/alert/runbook cho session, 429, rejected, queue pause, backup và tenant violation.

**Gate:** chỉ mở traffic thật sau khi đóng các P1 trong [production readiness audit](../10-audits/production-readiness.md).

## Checklist vận hành hằng ngày

- [ ] Không chạy Zalo Web/Desktop cùng nick đang gắn CRM.
- [ ] Kiểm tra nick/OA đang `connected` trước khi thao tác.
- [ ] Gửi hàng loạt cá nhân **CHỈ** qua module `broadcast` có kiểm soát (`/marketing/broadcasts`) — không gửi tay hàng loạt ngoài luồng này (script, API trực tiếp, nhờ công cụ ngoài).
- [ ] Trước khi bấm "Bắt đầu" 1 chiến dịch: xác nhận người nhận đã kết bạn/đã từng nhắn qua lại (không phải `none`/`ghost`), đã lọc opt-out, đúng 1 nick cho cả chiến dịch, và đã tự test bằng contact/nick thật của mình trước khi dùng cho khách thật.
- [ ] Mọi chiến dịch có người duyệt và gửi thử.
- [ ] Theo dõi queue paused, rejected, 429 và session expired — broadcast đang `paused` phải có người xem lý do trước khi bấm resume.
- [ ] Kiểm tra opt-out/blacklist trước khi chạy chiến dịch.
- [ ] Không đưa cookie/session/token vào log, ticket hoặc chat.
- [ ] Ghi nhận sự cố provider và dừng nick (kill switch) nếu có dấu hiệu bất thường.

## Tính năng dự kiến sẽ triển khai tiếp theo

Các mục này TRƯỚC ĐÂY được viết dưới dạng "chặn/chưa làm" trong chính sách —
nay chuyển thành roadmap tính năng cụ thể, để không bị hiểu nhầm là lệnh cấm
vĩnh viễn. Chưa có mốc thời gian cam kết; làm theo thứ tự ưu tiên khi có nhu
cầu nghiệp vụ hoặc tài nguyên (OA account, thời gian benchmark...).

1. **Kênh Zalo OA/OpenAPI/ZNS/ZBS (Tranche 4)** — gửi khuyến mãi, thông báo
   đơn hàng, lịch nghỉ, tin giao dịch cho số đông qua kênh chính thức của công
   ty, tách khỏi Zalo cá nhân. Cần trước: đăng ký OA, gói dịch vụ, template
   được duyệt. Đây là hạng mục lớn nhất còn lại.
2. **Broadcast cá nhân — mở rộng Phase 3b+:**
   - Gửi ảnh/album đã xong Phase 3a (2026-10-01, chờ deploy) — còn lại video/file.
   - Rải 1 chiến dịch qua nhiều nick (hiện 1 chiến dịch = 1 nick).
   - Bộ lọc người nhận động theo tag/trạng thái/score (hiện chỉ danh sách cố
     định chọn tay lúc tạo).
   - A/B test nội dung (`variantSpec`/`abTestStats` đã có field schema sẵn,
     chưa có code).
3. **Cutover RLS sang role hạn chế (Tranche 3)** — tạo `DB_APP_USER`
   NOSUPERUSER/NOBYPASSRLS, bật `TENANT_GUARD_MODE=warn→enforce` và
   `RLS_SET_CONFIG=true` thật, sau khi chạy negative cross-org suite trên
   staging. Hiện mới áp policy (92/92 bảng) ở chế độ chuẩn bị, chưa enforce.
4. **Host readiness & benchmark (Tranche 5)** — benchmark số user đồng thời,
   HTTPS/HSTS/CSP enforce (hiện CSP report-only), restore rehearsal đầy đủ
   (DB đã test, media/config chưa), off-host backup (chưa có nơi lưu ngoài
   máy), monitoring/alert cho session/429/rejected/queue pause.
5. **Xác minh recording 2 chiều cuộc gọi** — cần cuộc gọi test thật qua
   OmiCall với câu định danh 2 đầu để chứng minh không thiếu giọng; đây là
   việc xác minh ngoài CRM, không phải code.

## Các điểm chưa được suy đoán

- Quota/SLA chính xác của Zalo cá nhân và `zca-js`: `UNKNOWN`.
- Số user đồng thời an toàn: `CAPACITY NOT YET BENCHMARKED`.
- OA package/quota thực tế của công ty: `NEEDS VERIFICATION`.
- Khả năng khôi phục đầy đủ media/config sau backup: `NEEDS VERIFICATION`.

Tài liệu này là nguồn quyết định cho các thay đổi tiếp theo; code, migration, test và deployment phải link về đây thay vì tự tạo policy riêng.
