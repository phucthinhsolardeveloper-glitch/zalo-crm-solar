# Thiết kế: Ghi nhận cuộc gọi Zalo + đính kèm ghi âm thủ công

Ngày: 2026-07-23

## Bối cảnh / vấn đề

Team bán hàng cần theo dõi lịch sử cuộc gọi (thoại/video) với khách trong CRM, và
có thể nghe lại ghi âm cuộc gọi khi cần đối chiếu/đào tạo.

Đã khảo sát: thư viện `zca-js` (client Zalo không chính thức, đang dùng cho toàn
bộ tích hợp Zalo trong dự án) **không có API gọi thoại/video thật** — không có
signaling, không có audio stream. Chỉ có 2 thứ liên quan tới "call":
- Cờ cấu hình chặn/nhận cuộc gọi từ người lạ (`accept_stranger_call`).
- Sự kiện bạn bè `BLOCK_CALL`/`UNBLOCK_CALL` (chặn/mở chặn *cho phép gọi*, không
  phải bản thân 1 cuộc gọi).

Cơ chế đang có (`backend/src/modules/engagement/engagement-service.ts` +
`backend/src/modules/chat/message-handler.ts:489-499`) chỉ **đọc gián tiếp**:
khi 2 bên gọi nhau qua Zalo thật (trên điện thoại/app Zalo của họ), Zalo tự đẩy
1 tin nhắn hệ thống vào luồng chat với `content.action` chứa `"calltime"` hoặc
`"misscall"` + `content.params` (JSON chứa `duration`, `isCaller`, `calltype`).
Backend parse tin này (`detectContentType()` trong
`backend/src/modules/zalo/zalo-message-helpers.ts:23-90`, và `parseCallMeta()`/
`messageEngagementInputs()` trong `engagement-service.ts:59-122`) để tăng biến
đếm `contact_engagement_daily.callCount`/`missedCallCount`. Đây **chỉ là
aggregate counter** — không phải 1 entity riêng để gắn ghi âm vào, và **không có
audio** ở bất kỳ đâu trong luồng dữ liệu này.

**Quyết định (đã chốt với chủ dự án):** không có cách nào để backend tự gọi
hoặc tự ghi âm cuộc gọi Zalo. Hướng đi:
1. **Click-to-call**: nút trong CRM mở Zalo thật (theo pattern deep-link có sẵn
   `https://zalo.me/{uid}`, xem `ZaloUserInfoDialog.vue:124`) để sale tự bấm gọi
   trong app Zalo thật của họ.
2. **Ghi âm thủ công**: sale tự ghi âm bằng công cụ ngoài CRM (điện thoại, phần
   mềm ghi màn hình...), rồi upload file audio lên CRM, gắn vào đúng cuộc gọi.

## Mục tiêu

- Nâng cấp việc "biết có cuộc gọi xảy ra" từ counter aggregate thành 1 entity
  `CallRecord` per-cuộc-gọi, để có thể: xem timeline, gắn ghi âm, gắn ghi chú.
- Cho sale bấm 1 nút để mở Zalo thật gọi khách, tự động log lại "đã gọi lúc nào".
- Cho sale upload file ghi âm (mp3/m4a/wav/ogg/aac) gắn vào 1 `CallRecord` —
  của cuộc gọi tự phát hiện (từ tin nhắn hệ thống Zalo) hoặc cuộc gọi tự log tay.
- Xem lại: card cuộc gọi trong khung chat có audio player khi đã có ghi âm; tab
  "Lịch sử cuộc gọi" trong panel liên hệ liệt kê toàn bộ `CallRecord`.

## Ngoài phạm vi (out of scope)

- Không tự động gọi qua backend (zca-js không hỗ trợ — không có công nghệ nào
  bypass được giới hạn này trong phạm vi dự án).
- Không tự động ghi âm — luôn cần sale tự ghi bằng công cụ ngoài rồi upload tay.
- Không xử lý cuộc gọi nhóm (group call) — chỉ 1-1 giữa 1 nick Zalo và 1 khách.
- Không tích hợp tổng đài VoIP thật (Twilio/SIP...) — có thể là hướng mở rộng
  sau nhưng không nằm trong spec này.

## Kiến trúc

### 1. Data model — model mới `CallRecord` (Prisma, org-scoped)

```prisma
model CallRecord {
  id                  String    @id @default(uuid())
  orgId               String    @map("org_id")
  contactId           String    @map("contact_id")
  friendId            String?   @map("friend_id")
  zaloAccountId       String    @map("zalo_account_id") // nick thực hiện/nhận cuộc gọi
  conversationId      String?   @map("conversation_id")

  direction           String    // 'outbound' | 'inbound'
  callType            String    // 'voice' | 'video'
  status              String    // 'manual' | 'connected' | 'missed'
  durationSec         Int?      @map("duration_sec")
  occurredAt          DateTime  @map("occurred_at")

  sourceMessageId     String?   @map("source_message_id") // link Message nếu auto-detect

  recordingKey        String?   @map("recording_key")        // MinIO object key
  recordingUrl         String?   @map("recording_url")
  recordingMimeType    String?   @map("recording_mime_type")
  recordingSizeBytes   Int?      @map("recording_size_bytes")

  note                String?
  createdByUserId     String?   @map("created_by_user_id")
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")

  org         Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact     Contact       @relation(fields: [contactId], references: [id], onDelete: Cascade)
  friend      Friend?       @relation(fields: [friendId], references: [id], onDelete: SetNull)
  zaloAccount ZaloAccount   @relation(fields: [zaloAccountId], references: [id], onDelete: Cascade)
  conversation Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  sourceMessage Message?    @relation(fields: [sourceMessageId], references: [id], onDelete: SetNull)
  createdBy   User?         @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([orgId, contactId, occurredAt(sort: Desc)])
  @@index([orgId, occurredAt(sort: Desc)])
  // sourceMessageId nullable → Postgres cho nhiều NULL, chỉ chặn trùng khi
  // CÙNG 1 message auto-detect ra 2 CallRecord (chống race/replay listener).
  @@unique([sourceMessageId])
  @@map("call_records")
}
```

- Migration mới + RLS policy theo pattern các model org-scoped khác (xem
  migration gần nhất có RLS, vd `20260522010000_privacy_phase_rieng_tu`).
  Thêm `'CallRecord'` vào `ORG_SCOPED_MODELS`
  (`backend/src/shared/tenant/org-scoped-models.ts`).
- Không tái dùng `MediaAsset`/`MediaBlob` (đó là kho ảnh/file marketing, sai
  ngữ nghĩa — có visibility/folder/watermark không liên quan). Ghi âm lưu field
  riêng trên `CallRecord`, dùng thẳng `StorageDriver.uploadBuffer` (đã có ở
  `backend/src/shared/storage/minio-client.ts`).

### 2. Auto-detect cuộc gọi thật (mở rộng, không phá hành vi cũ)

Tại `backend/src/modules/chat/message-handler.ts:489-499`, hiện tại khi
`message.contentType === 'call'` chỉ gọi `messageEngagementInputs()` →
`incrementDailyAggregate()` (tăng counter). Thêm bước: upsert 1 dòng
`CallRecord` (idempotent theo `sourceMessageId` — tránh double-insert khi
webhook/listener replay):
- `status`: `'missed'` nếu `callMeta.isMissed`, ngược lại `'connected'`.
- `direction`: `'outbound'` nếu `callMeta.isCaller`, ngược lại `'inbound'`.
- `callType`: từ `callMeta.calltype` (0 → voice, 1 → video).
- `durationSec`, `occurredAt` (= thời gian tin nhắn), `contactId`/`friendId`/
  `zaloAccountId`/`conversationId` lấy từ context tin nhắn hiện có (đã đủ trong
  message-handler.ts tại điểm này).

Engagement counter cũ (`callCount`/`missedCallCount`) **giữ nguyên, chạy song
song** — không migrate/bỏ, vì các nơi khác (heatmap, scoring) đang phụ thuộc.

### 3. Backend — module mới `backend/src/modules/calls/`

`call-routes.ts` + `call-service.ts`, đăng ký trong `app.ts` theo pattern các
module khác.

- `GET /api/v1/contacts/:contactId/calls` — danh sách `CallRecord` (paginate,
  sort `occurredAt desc`).
- `POST /api/v1/calls` — log thủ công (click-to-call tạo `status='manual'`,
  `direction='outbound'`; hoặc sale tự nhập tay đủ field cho cuộc gọi ngoài
  luồng chat, vd gọi bằng SĐT riêng).
  Body: `{ contactId, friendId?, zaloAccountId, callType, direction, durationSec?, occurredAt, note? }`.
- `POST /api/v1/calls/:id/recording` — multipart upload ghi âm. Validate
  mimetype whitelist (`audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/ogg`,
  `audio/aac`), size cap (config, đề xuất 20MB), quét `scanOrPass` (tái dùng
  `shared/security/clamav-client.ts`, cùng pattern `media-routes.ts:30`). Lưu
  qua `StorageDriver.uploadBuffer`, set `recordingKey`/`recordingUrl`/
  `recordingMimeType`/`recordingSizeBytes`.
- `DELETE /api/v1/calls/:id/recording` — gỡ ghi âm (upload nhầm file), xoá
  object storage + null hoá 4 field recording*.

Toàn bộ route qua `chatAccess`/tenant-guard hiện có (theo pattern
`chat-operations-routes.ts`), org-scope tự động qua Prisma extension.

### 4. Frontend

- Nút **"Gọi thoại" / "Gọi video"** — đặt ở chat header (`MessageThread.vue`,
  cạnh vùng action hiện có) và contact info panel. Click: mở tab mới
  `https://zalo.me/{uid}` (pattern có sẵn) + gọi `POST /calls` tạo
  `CallRecord` status=manual ngay lúc click (không chờ xác nhận kết nối —
  chấp nhận log "đã bấm gọi lúc X", không phải "đã kết nối lúc X").
- Card cuộc gọi trong chat (`special-message-renderer.vue`, đã render sẵn
  duration/missed/loại) — thêm nút "Đính kèm ghi âm" khi `CallRecord` liên kết
  chưa có `recordingUrl`; đã có thì hiện `<audio controls>` ngay trong card.
- Tab **"Lịch sử cuộc gọi"** trong contact detail panel — list `CallRecord`
  (icon hướng/loại/trạng thái, thời lượng, thời điểm, audio player nếu có,
  nút "Log cuộc gọi thủ công" để thêm entry ngoài luồng chat).
- Composable mới `frontend/src/composables/use-calls.ts` (list/create/upload
  recording), theo pattern các composable `use-*.ts` khác.

## Xử lý lỗi / edge case

- Upload ghi âm cho `CallRecord` không tồn tại / không thuộc org → 404 (tenant
  guard tự chặn qua Prisma extension, không cần check thủ công thêm).
- File không đúng mimetype whitelist → 400, thông báo rõ định dạng cho phép.
- Click-to-call khi khách chưa có `zaloAccountId`/UID hợp lệ (vd Contact chưa
  liên kết Friend nào) → ẩn nút, không hiện lỗi.
- Auto-detect từ message: nếu `CallRecord` đã tồn tại cho `sourceMessageId`
  (retry/replay listener) → upsert theo unique constraint
  `@@unique([sourceMessageId])` thay vì insert trùng.

## Kiểm thử

- Backend: unit test `call-service.ts` (tạo/list/upload/xoá recording, validate
  mimetype/size), test tenant isolation (org A không thấy `CallRecord` org B).
  Test message-handler mở rộng: message `contentType='call'` → đúng 1
  `CallRecord` được tạo với đúng direction/status/duration, không tạo trùng
  khi xử lý lại cùng message.
- Frontend: test composable `use-calls.ts` (mock API). Test hiển thị nút
  "Đính kèm ghi âm" / audio player theo state `recordingUrl`.
- Thủ công: bấm nút Gọi → xác nhận mở đúng `zalo.me/{uid}` + tạo record; giả
  lập 1 cuộc gọi Zalo thật giữa 2 nick test → xác nhận card cuộc gọi xuất hiện
  trong chat + `CallRecord` đúng dữ liệu; upload file audio → nghe lại được.
