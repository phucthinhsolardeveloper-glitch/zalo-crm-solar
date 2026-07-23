# Zalo Call Log + Ghi âm thủ công — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp việc phát hiện cuộc gọi Zalo (hiện chỉ là 1 counter aggregate) thành 1 entity `CallRecord` riêng biệt per-cuộc-gọi, cho phép: click-to-call mở Zalo thật, tự động log cuộc gọi thật phát hiện từ tin nhắn hệ thống Zalo, và đính kèm file ghi âm thủ công + nghe lại.

**Architecture:** Model `CallRecord` mới (org-scoped, tenant-guard). Backend: hàm thuần `parseCallDetails()` tách direction/callType/duration/missed từ nội dung tin nhắn "call" của Zalo → hook vào `message-handler.ts` hiện có (không phá `engagement-service.ts`) để auto-tạo `CallRecord`. Module REST mới `modules/calls/` cho list/log thủ công/upload-xoá ghi âm (tái dùng `StorageDriver.uploadBuffer` + `scanOrPass` đã có). Frontend: composable `use-calls.ts` + nút "Gọi" trong header chat (mở `zalo.me/{uid}`, pattern có sẵn) + nút "Đính kèm ghi âm"/audio player trong card cuộc gọi (`special-message-renderer.vue`, đã render sẵn) + component mới `ChatCallHistory.vue` chèn vào tab Activity đã có (`ChatContactPanel.vue`, cạnh `ChatAppointments`).

**Tech Stack:** Fastify + Prisma (Postgres) backend, Vue 3 `<script setup>` + Vuetify frontend, Vitest cho cả 2.

## Global Constraints

- zca-js không có API gọi/ghi âm thật — mọi bước liên quan tới "gọi" chỉ là: (a) mở Zalo thật qua deep-link cho sale tự bấm, (b) đọc lại tin nhắn hệ thống Zalo đã gửi sau khi 2 bên gọi nhau. Không có audio ở bất kỳ đâu trong dữ liệu Zalo.
- Không phá engagement counter cũ (`callCount`/`missedCallCount` trên `contact_engagement_daily`) — các nơi khác (heatmap, scoring) phụ thuộc nó, giữ nguyên chạy song song.
- Mọi model mới phải org-scoped (thêm vào `ORG_SCOPED_MODELS`).
- File ghi âm: whitelist mime `audio/mpeg, audio/mp4, audio/wav, audio/ogg, audio/aac`; size cap 20MB; quét virus qua `scanOrPass` trước khi lưu (bắt buộc, cùng chính sách với `media-routes.ts`).
- SPDX header bắt buộc cho mọi file `.ts`/`.vue` mới:
  ```
  // SPDX-License-Identifier: AGPL-3.0-or-later
  // Copyright (C) 2026 Nguyễn Tiến Lộc
  ```
- Backend NodeNext: import nội bộ luôn có đuôi `.js` dù file nguồn là `.ts`.
- Trước khi coi 1 task xong: `npx tsc --noEmit` (backend) / `npx vue-tsc -b` (frontend) không lỗi mới do task đó gây ra.

---

## Task 1: Prisma schema — model `CallRecord` + migration + đăng ký org-scoped

**Files:**
- Modify: `backend/prisma/schema.prisma` (thêm model `CallRecord`, thêm relation array vào `Contact`, `Friend`, `ZaloAccount`, `Conversation`, `Message`, `User`)
- Create: `backend/prisma/migrations/20260723050000_call_records/migration.sql`
- Modify: `backend/src/shared/tenant/org-scoped-models.ts`
- Modify: `backend/prisma/rls/tenant-rls.sql` (thêm block RLS cho `call_records`, theo đúng template các bảng khác trong file — file này chưa auto-apply, chỉ giữ đồng bộ khi rollout RLS)

**Interfaces:**
- Produces: Prisma model `CallRecord` với các field: `id, orgId, contactId, friendId?, zaloAccountId, conversationId?, direction ('inbound'|'outbound'), callType ('voice'|'video'), status ('manual'|'connected'|'missed'), durationSec?, occurredAt, sourceMessageId? (unique), recordingKey?, recordingUrl?, recordingMimeType?, recordingSizeBytes?, note?, createdByUserId?, createdAt, updatedAt`. Prisma client field/table: `prisma.callRecord`, table `call_records`.

- [ ] **Step 1: Thêm model `CallRecord` vào `backend/prisma/schema.prisma`**

Chèn model mới ngay sau model `Contact` (dòng 741, sau `@@map("contacts")` `}` — chèn trước dòng tiếp theo bất kỳ, không quan trọng vị trí chính xác miễn nằm ngoài mọi model khác):

```prisma
// CallRecord — 1 dòng / 1 cuộc gọi Zalo (thật hoặc log tay). zca-js không có API
// gọi/ghi âm thật (xem docs/superpowers/specs/2026-07-23-zalo-call-log-recording-design.md)
// nên đây chỉ là: (a) log click-to-call thủ công, (b) auto-detect từ tin nhắn hệ
// thống Zalo (contentType='call'), (c) nơi gắn file ghi âm sale tự upload.
model CallRecord {
  id             String   @id @default(uuid())
  orgId          String   @map("org_id")
  contactId      String   @map("contact_id")
  friendId       String?  @map("friend_id")
  zaloAccountId  String   @map("zalo_account_id")
  conversationId String?  @map("conversation_id")

  direction   String // 'outbound' | 'inbound'
  callType    String // 'voice' | 'video'
  status      String // 'manual' | 'connected' | 'missed'
  durationSec Int?     @map("duration_sec")
  occurredAt  DateTime @map("occurred_at")

  // Link tới Message nếu auto-detect từ tin nhắn hệ thống Zalo. Unique: 1 message
  // chỉ tạo ra tối đa 1 CallRecord (chống double-insert khi listener replay).
  sourceMessageId String? @map("source_message_id")

  recordingKey       String? @map("recording_key")
  recordingUrl       String? @map("recording_url")
  recordingMimeType  String? @map("recording_mime_type")
  recordingSizeBytes Int?    @map("recording_size_bytes")

  note            String?
  createdByUserId String?  @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  org          Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade)
  contact      Contact       @relation(fields: [contactId], references: [id], onDelete: Cascade)
  friend       Friend?       @relation(fields: [friendId], references: [id], onDelete: SetNull)
  zaloAccount  ZaloAccount   @relation(fields: [zaloAccountId], references: [id], onDelete: Cascade)
  conversation Conversation? @relation(fields: [conversationId], references: [id], onDelete: SetNull)
  sourceMessage Message?     @relation(fields: [sourceMessageId], references: [id], onDelete: SetNull)
  createdBy    User?         @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([orgId, contactId, occurredAt(sort: Desc)])
  @@index([orgId, occurredAt(sort: Desc)])
  // sourceMessageId nullable → Postgres cho nhiều NULL, chỉ chặn trùng khi CÙNG 1
  // message auto-detect ra 2 CallRecord (chống race/replay listener).
  @@unique([sourceMessageId])
  @@map("call_records")
}
```

- [ ] **Step 2: Thêm back-relation field vào 6 model liên quan**

`Contact` (chèn ngay trước dòng `@@index([orgId, leadScore(sort: Desc)])`, khoảng dòng 738):
```prisma
  callRecords       CallRecord[]
```

`Friend` (chèn ngay trước dòng `@@index([orgId, scoreUpdatedAt(sort: Desc)])`, khoảng dòng 2003):
```prisma
  callRecords CallRecord[]
```

`ZaloAccount` (chèn ngay trước dòng trống + `@@map("zalo_accounts")`, khoảng dòng 430):
```prisma
  callRecords                      CallRecord[]
```

`Conversation` (chèn ngay trước dòng `@@index([orgId, threadType, zaloAccountId, lastMessageAt(sort: Desc)])`, khoảng dòng 810):
```prisma
  callRecords   CallRecord[]
```

`Message` (chèn ngay trước dòng `// M10/M11 — attribution + filter`, khoảng dòng 896 — quan hệ 1-1 do `sourceMessageId` unique nên field số ít, không phải mảng):
```prisma
  callRecord CallRecord?
```

`User` (chèn ngay trước dòng trống + `@@map("users")`, khoảng dòng 315):
```prisma
  callRecordsCreated        CallRecord[]
```

- [ ] **Step 3: Tạo migration SQL**

Tạo file `backend/prisma/migrations/20260723050000_call_records/migration.sql`:

```sql
-- CallRecord (2026-07-23): 1 dòng / 1 cuộc gọi Zalo (thật hoặc log tay). Xem
-- docs/superpowers/specs/2026-07-23-zalo-call-log-recording-design.md.
CREATE TABLE "call_records" (
  "id"                    TEXT NOT NULL PRIMARY KEY,
  "org_id"                TEXT NOT NULL,
  "contact_id"            TEXT NOT NULL,
  "friend_id"             TEXT,
  "zalo_account_id"       TEXT NOT NULL,
  "conversation_id"       TEXT,

  "direction"             TEXT NOT NULL,
  "call_type"             TEXT NOT NULL,
  "status"                TEXT NOT NULL,
  "duration_sec"          INTEGER,
  "occurred_at"           TIMESTAMP(3) NOT NULL,

  "source_message_id"     TEXT,

  "recording_key"         TEXT,
  "recording_url"         TEXT,
  "recording_mime_type"   TEXT,
  "recording_size_bytes"  INTEGER,

  "note"                  TEXT,
  "created_by_user_id"    TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "call_records_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "call_records_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "call_records_friend_id_fkey"
    FOREIGN KEY ("friend_id") REFERENCES "friends"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "call_records_zalo_account_id_fkey"
    FOREIGN KEY ("zalo_account_id") REFERENCES "zalo_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "call_records_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "call_records_source_message_id_fkey"
    FOREIGN KEY ("source_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "call_records_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "call_records_org_id_contact_id_occurred_at_idx"
  ON "call_records"("org_id", "contact_id", "occurred_at" DESC);
CREATE INDEX "call_records_org_id_occurred_at_idx"
  ON "call_records"("org_id", "occurred_at" DESC);
CREATE UNIQUE INDEX "call_records_source_message_id_key"
  ON "call_records"("source_message_id");
```

- [ ] **Step 4: Đăng ký `CallRecord` vào tenant-guard**

Trong `backend/src/shared/tenant/org-scoped-models.ts`, thêm `'CallRecord'` vào cuối `Set`:

```ts
  'ZaloOaAppConfig', 'ZaloOaConnection', 'ZaloFormMapping', 'ZaloLeadEvent',
  'CallRecord',
]);
```

- [ ] **Step 5: Thêm block RLS cho `call_records` vào `backend/prisma/rls/tenant-rls.sql`**

Thêm vào cuối file (giữ nguyên thứ tự alphabetic nếu file đang theo thứ tự đó — nếu không chắc thứ tự, append cuối file là an toàn):

```sql
-- call_records
ALTER TABLE "call_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "call_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "call_records";
CREATE POLICY tenant_isolation ON "call_records"
  USING ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK ("org_id" = current_setting('app.current_org', true) OR current_setting('app.bypass_rls', true) = 'on');
```

- [ ] **Step 6: Generate Prisma Client + verify migration áp được**

Run (trong `backend/`):
```bash
npx prisma generate
npx prisma migrate deploy
```
Expected: cả 2 lệnh exit 0, không lỗi. `npx prisma generate` phải in ra "Generated Prisma Client".

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: không có lỗi TS mới liên quan `CallRecord` (lỗi ở các file chưa viết task sau — bỏ qua, sẽ hết ở Task 2-5).

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260723050000_call_records backend/src/shared/tenant/org-scoped-models.ts backend/prisma/rls/tenant-rls.sql
git commit -s -m "feat(calls): thêm model CallRecord + migration + tenant-guard"
```

---

## Task 2: Backend — hàm thuần `parseCallDetails()` tách metadata cuộc gọi

**Files:**
- Create: `backend/src/modules/calls/call-detection.ts`
- Test: `backend/tests/call-detection.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CallDetails {
    direction: 'inbound' | 'outbound';
    callType: 'voice' | 'video';
    isMissed: boolean;
    durationSec: number;
  }
  export function parseCallDetails(content: unknown): CallDetails | null;
  ```
  (Task 5 gọi hàm này khi `message.contentType === 'call'`.)

Logic tham khảo 2 chỗ đã có trong repo xử lý cùng 1 payload Zalo call theo 2 cách khác nhau — gộp lại đầy đủ nhất:
- `backend/src/modules/engagement/engagement-service.ts:59-80` (`parseCallMeta`) — đọc shape `{action, params}` (`params` là JSON string chứa `duration`, `isCaller`).
- `frontend/src/components/chat/special-message-renderer.vue:341-368` — đọc thêm shape "fallback" phẳng `content.isMissed`, `content.callType` ('video'/'voice'/chứa "miss"), `content.isCaller`, `content.callDuration`/`content.duration`.

`parseCallDetails` gộp CẢ 2 shape (khác `parseCallMeta` ở chỗ KHÔNG bỏ qua khi `isSelf`/sale gọi — vì CallRecord cần log cả 2 chiều, còn `parseCallMeta`/engagement chỉ quan tâm chiều KH gọi).

- [ ] **Step 1: Viết test trước (fail)**

Tạo `backend/tests/call-detection.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseCallDetails } from '../src/modules/calls/call-detection.js';

describe('parseCallDetails — shape action/params (recommened.calltime/misscall)', () => {
  it('KH gọi, kết nối 39s → inbound/voice/connected', () => {
    const content = { action: 'recommened.calltime', params: JSON.stringify({ duration: 39, isCaller: 0 }) };
    expect(parseCallDetails(content)).toEqual({
      direction: 'inbound', callType: 'voice', isMissed: false, durationSec: 39,
    });
  });

  it('sale gọi, kết nối 120s → outbound/voice/connected', () => {
    const content = { action: 'recommened.calltime', params: JSON.stringify({ duration: 120, isCaller: 1 }) };
    expect(parseCallDetails(content)).toEqual({
      direction: 'outbound', callType: 'voice', isMissed: false, durationSec: 120,
    });
  });

  it('action chứa misscall → missed bất kể duration', () => {
    const content = { action: 'recommened.misscall', params: JSON.stringify({ duration: 0, isCaller: 0 }) };
    expect(parseCallDetails(content)).toEqual({
      direction: 'inbound', callType: 'voice', isMissed: true, durationSec: 0,
    });
  });

  it('duration=0 không kèm misscall → vẫn tính missed', () => {
    const content = { action: 'recommended.calltime', params: JSON.stringify({ duration: 0, isCaller: 1 }) };
    expect(parseCallDetails(content)?.isMissed).toBe(true);
  });

  it('params là object (không phải JSON string) vẫn đọc được', () => {
    const content = { action: 'recommened.calltime', params: { duration: 15, isCaller: 0 } };
    expect(parseCallDetails(content)).toEqual({
      direction: 'inbound', callType: 'voice', isMissed: false, durationSec: 15,
    });
  });
});

describe('parseCallDetails — shape phẳng fallback (callDuration/callType/isCaller/isMissed)', () => {
  it('callType chứa "video" → video', () => {
    const content = { callType: 'video_call', callDuration: 42, isCaller: 1 };
    expect(parseCallDetails(content)).toEqual({
      direction: 'outbound', callType: 'video', isMissed: false, durationSec: 42,
    });
  });

  it('isMissed=true (boolean rõ ràng) → ưu tiên field này', () => {
    const content = { isMissed: true, callType: 'voice', callDuration: 999, isCaller: 0 };
    expect(parseCallDetails(content)?.isMissed).toBe(true);
  });

  it('callType chứa "miss" → missed', () => {
    const content = { callType: 'miss_call', duration: 5, isCaller: 0 };
    expect(parseCallDetails(content)?.isMissed).toBe(true);
  });

  it('thiếu isCaller → mặc định inbound', () => {
    const content = { callDuration: 10 };
    expect(parseCallDetails(content)?.direction).toBe('inbound');
  });
});

describe('parseCallDetails — không phải call message', () => {
  it('content không phải object → null', () => {
    expect(parseCallDetails('hello')).toBeNull();
    expect(parseCallDetails(null)).toBeNull();
    expect(parseCallDetails(undefined)).toBeNull();
  });

  it('object không có action/callDuration/callType → null', () => {
    expect(parseCallDetails({ text: 'hi' })).toBeNull();
  });

  it('action không liên quan call → null', () => {
    expect(parseCallDetails({ action: 'zinstant.bankcard' })).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL (chưa có file nguồn)**

Run: `cd backend && npx vitest run tests/call-detection.test.ts`
Expected: FAIL — `Cannot find module '../src/modules/calls/call-detection.js'`.

- [ ] **Step 3: Viết `call-detection.ts`**

Tạo `backend/src/modules/calls/call-detection.ts`:
```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * call-detection.ts — tách metadata cuộc gọi (direction/loại/missed/duration) từ
 * nội dung tin nhắn hệ thống Zalo (contentType='call').
 *
 * Gộp 2 cách Zalo thực tế trả dữ liệu (đã thấy trong repo, KHÔNG suy đoán):
 *   1. `{action:"recommened.calltime"|"recommened.misscall", params:"<json string>"}`
 *      — dùng bởi engagement-service.ts parseCallMeta().
 *   2. Shape phẳng fallback `{isMissed, callType, isCaller, callDuration|duration}`
 *      — dùng bởi frontend special-message-renderer.vue (1 số version SDK).
 *
 * Khác parseCallMeta (engagement-service.ts): KHÔNG bỏ qua khi sale gọi (isSelf) —
 * CallRecord cần log cả 2 chiều, engagement chỉ quan tâm chiều KH gọi (signal ý định KH).
 */

export interface CallDetails {
  direction: 'inbound' | 'outbound';
  callType: 'voice' | 'video';
  isMissed: boolean;
  durationSec: number;
}

function extractDuration(c: Record<string, unknown>): number {
  if (c.callDuration !== undefined) return Number(c.callDuration) || 0;
  if (c.duration !== undefined) return Number(c.duration) || 0;
  if (typeof c.params === 'string') {
    try {
      const p = JSON.parse(c.params);
      return Number(p?.duration ?? 0) || 0;
    } catch {
      return 0;
    }
  }
  if (typeof c.params === 'object' && c.params !== null) {
    return Number((c.params as { duration?: unknown }).duration ?? 0) || 0;
  }
  return 0;
}

function extractIsCaller(c: Record<string, unknown>): boolean {
  if (c.isCaller !== undefined) return !!c.isCaller;
  if (typeof c.params === 'string') {
    try {
      const p = JSON.parse(c.params);
      return !!p?.isCaller;
    } catch {
      return false;
    }
  }
  if (typeof c.params === 'object' && c.params !== null) {
    return !!(c.params as { isCaller?: unknown }).isCaller;
  }
  return false;
}

export function parseCallDetails(content: unknown): CallDetails | null {
  if (typeof content !== 'object' || content === null) return null;
  const c = content as Record<string, unknown>;

  const action = typeof c.action === 'string' ? c.action : '';
  const isCallAction = action.includes('calltime') || action.includes('misscall');
  const hasFallbackShape = c.callDuration !== undefined || c.callType !== undefined;
  if (!isCallAction && !hasFallbackShape) return null;

  const callTypeStr = typeof c.callType === 'string' ? c.callType.toLowerCase() : '';
  const callType: 'voice' | 'video' = callTypeStr.includes('video') ? 'video' : 'voice';

  const durationSec = extractDuration(c);

  let isMissed: boolean;
  if (typeof c.isMissed === 'boolean') {
    isMissed = c.isMissed;
  } else if (action.includes('misscall')) {
    isMissed = true;
  } else if (callTypeStr.includes('miss')) {
    isMissed = true;
  } else {
    isMissed = durationSec === 0;
  }

  const direction: 'inbound' | 'outbound' = extractIsCaller(c) ? 'outbound' : 'inbound';

  return { direction, callType, isMissed, durationSec };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd backend && npx vitest run tests/call-detection.test.ts`
Expected: tất cả test PASS (13 test cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/calls/call-detection.ts backend/tests/call-detection.test.ts
git commit -s -m "feat(calls): parseCallDetails — tách direction/loại/missed/duration từ tin nhắn call Zalo"
```

---

## Task 3: Backend — `call-service.ts` (list, log thủ công, upsert auto-detect, upload/xoá ghi âm)

**Files:**
- Create: `backend/src/modules/calls/call-service.ts`
- Test: `backend/tests/call-service.test.ts`

**Interfaces:**
- Consumes: `prisma` từ `../../shared/database/prisma-client.js`; `CallDetails` từ `./call-detection.js` (Task 2).
- Produces (dùng bởi Task 4 routes + Task 5 message-handler hook):
  ```ts
  export interface CreateManualCallInput {
    orgId: string;
    contactId: string;
    friendId?: string | null;
    zaloAccountId: string;
    conversationId?: string | null;
    callType: 'voice' | 'video';
    direction: 'inbound' | 'outbound';
    durationSec?: number | null;
    occurredAt?: Date;
    note?: string | null;
    createdByUserId?: string | null;
  }
  export function createManualCall(input: CreateManualCallInput): Promise<CallRecordDTO>;

  export interface UpsertFromMessageInput {
    orgId: string;
    contactId: string;
    zaloAccountId: string;
    conversationId: string | null;
    sourceMessageId: string;
    occurredAt: Date;
    details: CallDetails; // từ parseCallDetails()
  }
  export function upsertCallRecordFromMessage(input: UpsertFromMessageInput): Promise<void>;

  export function listCallsForContact(orgId: string, contactId: string): Promise<CallRecordDTO[]>;

  export interface AttachRecordingInput {
    orgId: string;
    callId: string;
    buffer: Buffer;
    mimeType: string;
    originalName?: string;
  }
  export function attachRecording(input: AttachRecordingInput): Promise<CallRecordDTO | null>;

  export function removeRecording(orgId: string, callId: string): Promise<CallRecordDTO | null>;
  ```

- [ ] **Step 1: Viết test trước (mock prisma + storage, theo pattern `tests/care-session-service.test.ts`)**

Tạo `backend/tests/call-service.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  callRecord: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const uploadBufferMock = vi.fn();
vi.mock('../src/shared/storage/minio-client.js', () => ({ uploadBuffer: uploadBufferMock }));

const {
  createManualCall,
  upsertCallRecordFromMessage,
  listCallsForContact,
  attachRecording,
  removeRecording,
} = await import('../src/modules/calls/call-service.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createManualCall', () => {
  it('tạo CallRecord status=manual với input tối thiểu', async () => {
    prismaMock.callRecord.create.mockResolvedValue({ id: 'cr1', status: 'manual' });
    const result = await createManualCall({
      orgId: 'org1', contactId: 'c1', zaloAccountId: 'z1',
      callType: 'voice', direction: 'outbound',
    });
    expect(prismaMock.callRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orgId: 'org1', contactId: 'c1', zaloAccountId: 'z1',
        callType: 'voice', direction: 'outbound', status: 'manual',
      }),
    }));
    expect(result).toEqual({ id: 'cr1', status: 'manual' });
  });
});

describe('upsertCallRecordFromMessage', () => {
  it('gọi prisma.callRecord.upsert với where theo sourceMessageId (chống double-insert)', async () => {
    prismaMock.callRecord.upsert.mockResolvedValue({ id: 'cr2' });
    await upsertCallRecordFromMessage({
      orgId: 'org1', contactId: 'c1', zaloAccountId: 'z1', conversationId: 'conv1',
      sourceMessageId: 'msg1', occurredAt: new Date('2026-07-23T00:00:00Z'),
      details: { direction: 'inbound', callType: 'voice', isMissed: false, durationSec: 39 },
    });
    expect(prismaMock.callRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sourceMessageId: 'msg1' },
      create: expect.objectContaining({
        status: 'connected', direction: 'inbound', callType: 'voice', durationSec: 39,
      }),
    }));
  });

  it('isMissed=true → status=missed', async () => {
    prismaMock.callRecord.upsert.mockResolvedValue({ id: 'cr3' });
    await upsertCallRecordFromMessage({
      orgId: 'org1', contactId: 'c1', zaloAccountId: 'z1', conversationId: null,
      sourceMessageId: 'msg2', occurredAt: new Date(),
      details: { direction: 'inbound', callType: 'voice', isMissed: true, durationSec: 0 },
    });
    expect(prismaMock.callRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'missed' }),
    }));
  });
});

describe('listCallsForContact', () => {
  it('query theo orgId+contactId, sort occurredAt desc', async () => {
    prismaMock.callRecord.findMany.mockResolvedValue([{ id: 'cr1' }]);
    const result = await listCallsForContact('org1', 'c1');
    expect(prismaMock.callRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: 'org1', contactId: 'c1' },
      orderBy: { occurredAt: 'desc' },
    }));
    expect(result).toEqual([{ id: 'cr1' }]);
  });
});

describe('attachRecording', () => {
  it('upload qua storage rồi update 4 field recording*', async () => {
    uploadBufferMock.mockResolvedValue({
      key: 'media/abc.mp3', url: 'https://cdn/abc.mp3', size: 1234,
      mimeType: 'audio/mpeg', contentHash: 'abc', deduped: false,
    });
    prismaMock.callRecord.findFirst.mockResolvedValue({ id: 'cr1', orgId: 'org1' });
    prismaMock.callRecord.update.mockResolvedValue({ id: 'cr1', recordingUrl: 'https://cdn/abc.mp3' });

    const result = await attachRecording({
      orgId: 'org1', callId: 'cr1',
      buffer: Buffer.from('fake-audio'), mimeType: 'audio/mpeg', originalName: 'ghiam.mp3',
    });

    expect(uploadBufferMock).toHaveBeenCalledWith(expect.any(Buffer), 'audio/mpeg', 'ghiam.mp3');
    expect(prismaMock.callRecord.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: {
        recordingKey: 'media/abc.mp3',
        recordingUrl: 'https://cdn/abc.mp3',
        recordingMimeType: 'audio/mpeg',
        recordingSizeBytes: 1234,
      },
    });
    expect(result).toEqual({ id: 'cr1', recordingUrl: 'https://cdn/abc.mp3' });
  });

  it('callId không thuộc org → null, không upload', async () => {
    prismaMock.callRecord.findFirst.mockResolvedValue(null);
    const result = await attachRecording({
      orgId: 'org1', callId: 'cr-not-exist', buffer: Buffer.from('x'), mimeType: 'audio/mpeg',
    });
    expect(result).toBeNull();
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });
});

describe('removeRecording', () => {
  it('null hoá 4 field recording*', async () => {
    prismaMock.callRecord.findFirst.mockResolvedValue({ id: 'cr1', orgId: 'org1' });
    prismaMock.callRecord.update.mockResolvedValue({ id: 'cr1', recordingUrl: null });
    const result = await removeRecording('org1', 'cr1');
    expect(prismaMock.callRecord.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: {
        recordingKey: null, recordingUrl: null,
        recordingMimeType: null, recordingSizeBytes: null,
      },
    });
    expect(result).toEqual({ id: 'cr1', recordingUrl: null });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd backend && npx vitest run tests/call-service.test.ts`
Expected: FAIL — module `call-service.ts` chưa tồn tại.

- [ ] **Step 3: Viết `call-service.ts`**

Tạo `backend/src/modules/calls/call-service.ts`:
```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * call-service.ts — CRUD cho CallRecord: log thủ công (click-to-call), auto-detect
 * từ tin nhắn hệ thống Zalo, upload/xoá ghi âm (tái dùng StorageDriver + AV scan).
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { uploadBuffer } from '../../shared/storage/minio-client.js';
import { logger } from '../../shared/utils/logger.js';
import type { CallDetails } from './call-detection.js';

export interface CreateManualCallInput {
  orgId: string;
  contactId: string;
  friendId?: string | null;
  zaloAccountId: string;
  conversationId?: string | null;
  callType: 'voice' | 'video';
  direction: 'inbound' | 'outbound';
  durationSec?: number | null;
  occurredAt?: Date;
  note?: string | null;
  createdByUserId?: string | null;
}

export async function createManualCall(input: CreateManualCallInput) {
  return prisma.callRecord.create({
    data: {
      orgId: input.orgId,
      contactId: input.contactId,
      friendId: input.friendId ?? null,
      zaloAccountId: input.zaloAccountId,
      conversationId: input.conversationId ?? null,
      callType: input.callType,
      direction: input.direction,
      status: 'manual',
      durationSec: input.durationSec ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      note: input.note ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export interface UpsertFromMessageInput {
  orgId: string;
  contactId: string;
  zaloAccountId: string;
  conversationId: string | null;
  sourceMessageId: string;
  occurredAt: Date;
  details: CallDetails;
}

/**
 * Idempotent theo sourceMessageId — an toàn khi message-handler xử lý lại cùng 1
 * message (retry/replay listener zca-js).
 */
export async function upsertCallRecordFromMessage(input: UpsertFromMessageInput): Promise<void> {
  const status = input.details.isMissed ? 'missed' : 'connected';
  const data = {
    orgId: input.orgId,
    contactId: input.contactId,
    zaloAccountId: input.zaloAccountId,
    conversationId: input.conversationId,
    direction: input.details.direction,
    callType: input.details.callType,
    status,
    durationSec: input.details.durationSec,
    occurredAt: input.occurredAt,
    sourceMessageId: input.sourceMessageId,
  };
  try {
    await prisma.callRecord.upsert({
      where: { sourceMessageId: input.sourceMessageId },
      create: data,
      update: {}, // đã tồn tại (replay) → giữ nguyên, không ghi đè
    });
  } catch (err) {
    logger.warn(`[calls] upsertCallRecordFromMessage lỗi (best-effort, bỏ qua): ${err}`);
  }
}

export async function listCallsForContact(orgId: string, contactId: string) {
  return prisma.callRecord.findMany({
    where: { orgId, contactId },
    orderBy: { occurredAt: 'desc' },
  });
}

export interface AttachRecordingInput {
  orgId: string;
  callId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

/** Trả null nếu callId không tồn tại/không thuộc org (caller trả 404). */
export async function attachRecording(input: AttachRecordingInput) {
  const existing = await prisma.callRecord.findFirst({
    where: { id: input.callId, orgId: input.orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const uploaded = await uploadBuffer(input.buffer, input.mimeType, input.originalName);
  return prisma.callRecord.update({
    where: { id: input.callId },
    data: {
      recordingKey: uploaded.key,
      recordingUrl: uploaded.url,
      recordingMimeType: uploaded.mimeType,
      recordingSizeBytes: uploaded.size,
    },
  });
}

/** Trả null nếu callId không tồn tại/không thuộc org (caller trả 404). */
export async function removeRecording(orgId: string, callId: string) {
  const existing = await prisma.callRecord.findFirst({
    where: { id: callId, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.callRecord.update({
    where: { id: callId },
    data: {
      recordingKey: null,
      recordingUrl: null,
      recordingMimeType: null,
      recordingSizeBytes: null,
    },
  });
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd backend && npx vitest run tests/call-service.test.ts`
Expected: tất cả test PASS.

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 lỗi liên quan `call-service.ts`/`call-detection.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/calls/call-service.ts backend/tests/call-service.test.ts
git commit -s -m "feat(calls): call-service — log thủ công, auto-detect upsert, upload/xoá ghi âm"
```

---

## Task 4: Backend — REST routes `call-routes.ts` + đăng ký `app.ts`

**Files:**
- Create: `backend/src/modules/calls/call-routes.ts`
- Modify: `backend/src/app.ts` (import + `await app.register(callRoutes)`)

**Interfaces:**
- Consumes: `createManualCall`, `listCallsForContact`, `attachRecording`, `removeRecording` (Task 3); `authMiddleware` từ `../auth/auth-middleware.js`; `requireGrant` từ `../rbac/rbac-middleware.js`; `assertContactVisible` từ `../contacts/contact-scope.js`; `scanOrPass` từ `../../shared/security/clamav-client.js`.
- Produces: 4 route HTTP — `GET /api/v1/contacts/:contactId/calls`, `POST /api/v1/calls`, `POST /api/v1/calls/:id/recording`, `DELETE /api/v1/calls/:id/recording`.

- [ ] **Step 1: Viết `call-routes.ts`**

Tạo `backend/src/modules/calls/call-routes.ts`:
```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * call-routes.ts — REST API cho CallRecord: timeline theo contact, log thủ công
 * (click-to-call), upload/xoá ghi âm.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { assertContactVisible } from '../contacts/contact-scope.js';
import { scanOrPass } from '../../shared/security/clamav-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  createManualCall,
  listCallsForContact,
  attachRecording,
  removeRecording,
} from './call-service.js';

const RECORDING_MIME_ALLOWLIST = new Set([
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac',
]);
const RECORDING_MAX_BYTES = 20 * 1024 * 1024;

export async function callRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts/:contactId/calls — timeline cuộc gọi của 1 contact ──
  app.get(
    '/api/v1/contacts/:contactId/calls',
    { preHandler: requireGrant('contact', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { contactId } = request.params as { contactId: string };
      const visible = await assertContactVisible({
        userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
      });
      if (!visible) return reply.status(403).send({ error: 'Không có quyền xem liên hệ này' });

      const calls = await listCallsForContact(user.orgId, contactId);
      return { calls };
    },
  );

  // ── POST /api/v1/calls — log cuộc gọi thủ công (click-to-call hoặc nhập tay) ──
  app.post(
    '/api/v1/calls',
    { preHandler: requireGrant('contact', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = request.body as {
        contactId?: string; friendId?: string | null; zaloAccountId?: string;
        conversationId?: string | null; callType?: string; direction?: string;
        durationSec?: number | null; occurredAt?: string; note?: string | null;
      };

      if (!body?.contactId || !body?.zaloAccountId) {
        return reply.status(400).send({ error: 'contactId và zaloAccountId bắt buộc' });
      }
      if (body.callType !== 'voice' && body.callType !== 'video') {
        return reply.status(400).send({ error: "callType phải là 'voice' hoặc 'video'" });
      }
      if (body.direction !== 'inbound' && body.direction !== 'outbound') {
        return reply.status(400).send({ error: "direction phải là 'inbound' hoặc 'outbound'" });
      }

      const visible = await assertContactVisible({
        userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId: body.contactId,
      });
      if (!visible) return reply.status(403).send({ error: 'Không có quyền trên liên hệ này' });

      const call = await createManualCall({
        orgId: user.orgId,
        contactId: body.contactId,
        friendId: body.friendId ?? null,
        zaloAccountId: body.zaloAccountId,
        conversationId: body.conversationId ?? null,
        callType: body.callType,
        direction: body.direction,
        durationSec: body.durationSec ?? null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        note: body.note ?? null,
        createdByUserId: user.id,
      });
      return reply.status(201).send({ call });
    },
  );

  // ── POST /api/v1/calls/:id/recording — upload file ghi âm (multipart) ──────
  app.post(
    '/api/v1/calls/:id/recording',
    { preHandler: requireGrant('contact', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      try {
        let buffer: Buffer | null = null;
        let mimeType = '';
        let filename = '';

        for await (const part of request.parts()) {
          if (part.type !== 'file') continue;
          if (!RECORDING_MIME_ALLOWLIST.has(part.mimetype)) {
            return reply.status(415).send({ error: `Định dạng không hỗ trợ: ${part.mimetype}` });
          }
          buffer = await part.toBuffer();
          if (buffer.length > RECORDING_MAX_BYTES) {
            return reply.status(413).send({ error: 'File ghi âm vượt 20MB' });
          }
          mimeType = part.mimetype;
          filename = part.filename;
          break; // chỉ nhận 1 file/request
        }

        if (!buffer) return reply.status(400).send({ error: 'Không có file nào' });

        const av = await scanOrPass(buffer, { filename, userId: user.id });
        if (av.blocked) return reply.status(422).send({ error: av.reason, code: 'AV_BLOCKED' });

        const updated = await attachRecording({
          orgId: user.orgId, callId: id, buffer, mimeType, originalName: filename,
        });
        if (!updated) return reply.status(404).send({ error: 'CallRecord không tồn tại' });
        return { call: updated };
      } catch (err) {
        logger.error('[calls] upload recording error:', err);
        return reply.status(500).send({ error: 'Upload ghi âm thất bại' });
      }
    },
  );

  // ── DELETE /api/v1/calls/:id/recording — gỡ ghi âm (upload nhầm file) ──────
  app.delete(
    '/api/v1/calls/:id/recording',
    { preHandler: requireGrant('contact', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const updated = await removeRecording(user.orgId, id);
      if (!updated) return reply.status(404).send({ error: 'CallRecord không tồn tại' });
      return { call: updated };
    },
  );
}
```

- [ ] **Step 2: Đăng ký route trong `app.ts`**

Trong `backend/src/app.ts`, thêm import cạnh `notesRoutes` (dòng 52):
```ts
import { notesRoutes } from './modules/contacts/notes-routes.js';
import { callRoutes } from './modules/calls/call-routes.js';
```

Và đăng ký cạnh `notesRoutes` (dòng 278):
```ts
  await app.register(notesRoutes);
  await app.register(callRoutes);
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 lỗi.

- [ ] **Step 4: Build thử để bắt lỗi runtime khởi động sớm**

Run: `cd backend && npm run build`
Expected: build thành công (kiểm tra `package.json` script `build` thật, thường là `tsc` — nếu khác, dùng đúng script đã định nghĩa).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/calls/call-routes.ts backend/src/app.ts
git commit -s -m "feat(calls): REST routes list/log/upload/xoá ghi âm + đăng ký app.ts"
```

---

## Task 5: Backend — hook auto-detect vào `message-handler.ts`

**Files:**
- Modify: `backend/src/modules/chat/message-handler.ts:495-529` (thêm nhánh gọi `upsertCallRecordFromMessage`, KHÔNG đổi logic engagement hiện có)

**Interfaces:**
- Consumes: `parseCallDetails` (Task 2), `upsertCallRecordFromMessage` (Task 3).

- [ ] **Step 1: Đọc lại đúng đoạn cần sửa để xác nhận context (không đoán)**

Run: `sed -n '478,533p' backend/src/modules/chat/message-handler.ts`

Xác nhận thấy khối:
```ts
    if (msg.threadType !== 'group' && contactId) {
      void (async () => {
        try {
          const { incrementDailyAggregate, messageEngagementInputs, parseCallMeta } =
            await import('../engagement/engagement-service.js');
          ...
          const callMeta = message.contentType === 'call'
            ? parseCallMeta(msg.content, msg.isSelf)
            : null;
          const signals = messageEngagementInputs(message.contentType, msg.isSelf, hasQuote, callMeta);
          ...
          await incrementDailyAggregate({ ... });
        } catch (err) {
          // silent — engagement is best-effort
        }
      })();
    }
```

- [ ] **Step 2: Thêm nhánh CallRecord ngay sau `await incrementDailyAggregate(...)`, trong CÙNG try/catch**

Tìm đoạn:
```ts
          await incrementDailyAggregate({
            contactId,
            orgId: account.orgId,
            at: sentAt,
            inboundMsg: signals.inbound,
            outboundMsg: signals.outbound,
            mediaShare: signals.mediaShare,
            voiceMsg: signals.voiceMsg,
            call: signals.call,
            missedCall: signals.missedCall,
            quoteReply: signals.quoteReply,
            customerInitiated,
          });
        } catch (err) {
          // silent — engagement is best-effort
        }
      })();
    }
```

Thay bằng (thêm 6 dòng import + block mới, giữ nguyên phần còn lại y hệt):
```ts
          await incrementDailyAggregate({
            contactId,
            orgId: account.orgId,
            at: sentAt,
            inboundMsg: signals.inbound,
            outboundMsg: signals.outbound,
            mediaShare: signals.mediaShare,
            voiceMsg: signals.voiceMsg,
            call: signals.call,
            missedCall: signals.missedCall,
            quoteReply: signals.quoteReply,
            customerInitiated,
          });

          // Phase Call Log (2026-07-23) — nâng cấp counter engagement ở trên thành
          // 1 CallRecord riêng (để gắn ghi âm). Chạy song song, KHÔNG thay engagement.
          // Khác parseCallMeta: không bỏ qua khi sale gọi (isSelf) — cần log cả 2 chiều.
          if (message.contentType === 'call') {
            const { parseCallDetails } = await import('../calls/call-detection.js');
            const details = parseCallDetails(msg.content);
            if (details) {
              const { upsertCallRecordFromMessage } = await import('../calls/call-service.js');
              await upsertCallRecordFromMessage({
                orgId: account.orgId,
                contactId,
                zaloAccountId: msg.accountId,
                conversationId: conversation.id,
                sourceMessageId: message.id,
                occurredAt: sentAt,
                details,
              });
            }
          }
        } catch (err) {
          // silent — engagement + call-record đều best-effort
        }
      })();
    }
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 lỗi.

- [ ] **Step 4: Test hồi quy — chạy toàn bộ test suite backend liên quan chat/engagement**

Run: `cd backend && npx vitest run tests/call-detection.test.ts tests/call-service.test.ts`
Expected: PASS (không có test hiện có nào cho `message-handler.ts` gọi trực tiếp đoạn này — không có test để chạy thêm; xác nhận bằng cách build/tsc sạch là đủ ở bước này).

Run thêm để chắc không phá gì trong module chat hiện có:
Run: `cd backend && npx vitest run`
Expected: toàn bộ test suite PASS (không có FAIL mới so với trước khi sửa `message-handler.ts`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/chat/message-handler.ts
git commit -s -m "feat(calls): auto-tạo CallRecord từ tin nhắn call Zalo (message-handler hook)"
```

---

## Task 6: Frontend — composable `use-calls.ts`

**Files:**
- Create: `frontend/src/composables/use-calls.ts`
- Test: `frontend/src/composables/use-calls.spec.ts`

**Interfaces:**
- Consumes: `api` từ `@/api/index` (axios instance có sẵn, dùng khắp frontend — xem cách dùng trong `use-chat.ts`/`MessageThread.vue`: `api.post(...)`, `api.get(...)`).
- Produces:
  ```ts
  export interface CallRecordDTO {
    id: string; contactId: string; friendId: string | null; zaloAccountId: string;
    conversationId: string | null; sourceMessageId: string | null;
    direction: 'inbound' | 'outbound';
    callType: 'voice' | 'video'; status: 'manual' | 'connected' | 'missed';
    durationSec: number | null; occurredAt: string;
    recordingUrl: string | null; recordingMimeType: string | null;
    note: string | null; createdAt: string;
  }
  export function useCalls(): {
    calls: Ref<CallRecordDTO[]>;
    loading: Ref<boolean>;
    fetchCalls(contactId: string): Promise<void>;
    logManualCall(input: LogManualCallInput): Promise<CallRecordDTO>;
    uploadRecording(callId: string, file: File): Promise<CallRecordDTO>;
    removeRecording(callId: string): Promise<CallRecordDTO>;
  };
  ```

- [ ] **Step 1: Viết test trước (mock `@/api/index`)**

Tạo `frontend/src/composables/use-calls.spec.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiMock = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
vi.mock('@/api/index', () => ({ api: apiMock }));

const { useCalls } = await import('./use-calls');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCalls', () => {
  it('fetchCalls gọi GET đúng endpoint và set calls', async () => {
    apiMock.get.mockResolvedValue({ data: { calls: [{ id: 'cr1' }] } });
    const { calls, loading, fetchCalls } = useCalls();
    const p = fetchCalls('c1');
    expect(loading.value).toBe(true);
    await p;
    expect(apiMock.get).toHaveBeenCalledWith('/contacts/c1/calls');
    expect(calls.value).toEqual([{ id: 'cr1' }]);
    expect(loading.value).toBe(false);
  });

  it('logManualCall gọi POST /calls với đúng body', async () => {
    apiMock.post.mockResolvedValue({ data: { call: { id: 'cr2' } } });
    const { logManualCall } = useCalls();
    const result = await logManualCall({
      contactId: 'c1', zaloAccountId: 'z1', callType: 'voice', direction: 'outbound',
    });
    expect(apiMock.post).toHaveBeenCalledWith('/calls', {
      contactId: 'c1', zaloAccountId: 'z1', callType: 'voice', direction: 'outbound',
    });
    expect(result).toEqual({ id: 'cr2' });
  });

  it('uploadRecording gửi multipart FormData tới đúng endpoint', async () => {
    apiMock.post.mockResolvedValue({ data: { call: { id: 'cr1', recordingUrl: 'https://x/a.mp3' } } });
    const { uploadRecording } = useCalls();
    const file = new File(['audio-bytes'], 'ghiam.mp3', { type: 'audio/mpeg' });
    const result = await uploadRecording('cr1', file);
    expect(apiMock.post).toHaveBeenCalledWith(
      '/calls/cr1/recording',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
    expect(result).toEqual({ id: 'cr1', recordingUrl: 'https://x/a.mp3' });
  });

  it('removeRecording gọi DELETE đúng endpoint', async () => {
    apiMock.delete.mockResolvedValue({ data: { call: { id: 'cr1', recordingUrl: null } } });
    const { removeRecording } = useCalls();
    const result = await removeRecording('cr1');
    expect(apiMock.delete).toHaveBeenCalledWith('/calls/cr1/recording');
    expect(result).toEqual({ id: 'cr1', recordingUrl: null });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd frontend && npx vitest run src/composables/use-calls.spec.ts`
Expected: FAIL — module `./use-calls` chưa tồn tại.

- [ ] **Step 3: Viết `use-calls.ts`**

Tạo `frontend/src/composables/use-calls.ts`:
```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref, type Ref } from 'vue';
import { api } from '@/api/index';

export interface CallRecordDTO {
  id: string;
  contactId: string;
  friendId: string | null;
  zaloAccountId: string;
  conversationId: string | null;
  direction: 'inbound' | 'outbound';
  callType: 'voice' | 'video';
  status: 'manual' | 'connected' | 'missed';
  durationSec: number | null;
  occurredAt: string;
  recordingUrl: string | null;
  recordingMimeType: string | null;
  note: string | null;
  createdAt: string;
}

export interface LogManualCallInput {
  contactId: string;
  friendId?: string | null;
  zaloAccountId: string;
  conversationId?: string | null;
  callType: 'voice' | 'video';
  direction: 'inbound' | 'outbound';
  durationSec?: number | null;
  occurredAt?: string;
  note?: string | null;
}

export function useCalls(): {
  calls: Ref<CallRecordDTO[]>;
  loading: Ref<boolean>;
  fetchCalls: (contactId: string) => Promise<void>;
  logManualCall: (input: LogManualCallInput) => Promise<CallRecordDTO>;
  uploadRecording: (callId: string, file: File) => Promise<CallRecordDTO>;
  removeRecording: (callId: string) => Promise<CallRecordDTO>;
} {
  const calls = ref<CallRecordDTO[]>([]);
  const loading = ref(false);

  async function fetchCalls(contactId: string): Promise<void> {
    loading.value = true;
    try {
      const { data } = await api.get(`/contacts/${contactId}/calls`);
      calls.value = data.calls;
    } finally {
      loading.value = false;
    }
  }

  async function logManualCall(input: LogManualCallInput): Promise<CallRecordDTO> {
    const { data } = await api.post('/calls', input);
    return data.call;
  }

  async function uploadRecording(callId: string, file: File): Promise<CallRecordDTO> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(`/calls/${callId}/recording`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.call;
  }

  async function removeRecording(callId: string): Promise<CallRecordDTO> {
    const { data } = await api.delete(`/calls/${callId}/recording`);
    return data.call;
  }

  return { calls, loading, fetchCalls, logManualCall, uploadRecording, removeRecording };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd frontend && npx vitest run src/composables/use-calls.spec.ts`
Expected: 4 test PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/use-calls.ts frontend/src/composables/use-calls.spec.ts
git commit -s -m "feat(calls): composable use-calls — fetch/log/upload/xoá ghi âm"
```

---

## Task 7: Frontend — nút "Gọi thoại"/"Gọi video" trong chat header

**Files:**
- Modify: `frontend/src/components/chat/MessageThread.vue` (thêm nút vào `.ch-actions`, dòng ~227; thêm hàm xử lý trong `<script setup>`)

**Interfaces:**
- Consumes: `useCalls().logManualCall` (Task 6); biến có sẵn trong component: `props.conversation.contact?.id`, `props.conversation.zaloAccount?.id`, `props.conversation.id`, `props.conversation.externalThreadId || props.conversation.contact?.zaloUid` (pattern xác nhận tại `MessageThread.vue:1759`).

- [ ] **Step 1: Thêm nút vào `.ch-actions` (ngay đầu, trước nút friendship — luôn hiện nếu có UID)**

Tìm đoạn (dòng 226-228):
```vue
        <!-- ch-actions: nút Kết bạn / menu ⋮ / ⓘ — đẩy phải dòng 1 (gom 2 dòng 2026-06-06) -->
        <div class="ch-actions">
          <!-- Smart friendship button: state-aware -->
```

Thay bằng:
```vue
        <!-- ch-actions: nút Kết bạn / menu ⋮ / ⓘ — đẩy phải dòng 1 (gom 2 dòng 2026-06-06) -->
        <div class="ch-actions">
          <!-- Click-to-call (2026-07-23): zca-js không gọi được thật → mở Zalo thật
               (pattern zalo.me/{uid} có sẵn ở ZaloUserInfoDialog.vue) để sale tự bấm gọi,
               đồng thời log 1 CallRecord status=manual. -->
          <div v-if="callTargetUid" class="call-hover-group">
            <button
              class="btn-action btn-call-voice"
              title="Gọi thoại qua Zalo"
              @click="onClickToCall('voice')"
            >
              <span class="ic"><PhoneIcon :size="14" :stroke-width="2" /></span> Gọi
            </button>
            <button
              class="btn-action btn-call-video fr-hover-pop"
              title="Gọi video qua Zalo"
              @click="onClickToCall('video')"
            >
              <span class="ic"><VideoIcon :size="14" :stroke-width="2" /></span> Video
            </button>
          </div>
          <!-- Smart friendship button: state-aware -->
```

- [ ] **Step 2: Import icon `Phone`/`Video` từ `lucide-vue-next` (cùng import block với `CalendarClockIcon`)**

Tìm dòng (khoảng 964):
```ts
CalendarClock as CalendarClockIcon,
```

Thêm ngay dòng dưới:
```ts
CalendarClock as CalendarClockIcon,
Phone as PhoneIcon,
Video as VideoIcon,
```

- [ ] **Step 3: Thêm `callTargetUid` computed + `onClickToCall` handler**

Chèn ngay sau hàm `onHeaderAvatarClick` đã có (sau dòng `if (!uid) return; userInfoUid.value = uid; userInfoDialog.value = true; }`, khoảng dòng 1759):
```ts
// Click-to-call (2026-07-23) — cùng nguồn UID với canClickHeader/onHeaderAvatarClick.
const callTargetUid = computed(() => {
  const conv = props.conversation;
  if (!conv || conv.threadType === 'group') return null;
  return conv.externalThreadId || conv.contact?.zaloUid || null;
});

async function onClickToCall(callType: 'voice' | 'video') {
  const conv = props.conversation;
  const uid = callTargetUid.value;
  if (!conv || !uid) return;
  window.open(`https://zalo.me/${uid}`, '_blank', 'noopener,noreferrer');

  const contactId = conv.contact?.id;
  const zaloAccountId = conv.zaloAccount?.id;
  if (!contactId || !zaloAccountId) return; // không đủ dữ liệu để log — vẫn đã mở Zalo
  try {
    await useCalls().logManualCall({
      contactId,
      zaloAccountId,
      conversationId: conv.id,
      callType,
      direction: 'outbound',
    });
  } catch (err) {
    console.error('[chat] log click-to-call error', err);
  }
}
```

- [ ] **Step 4: Import `useCalls` composable**

Tìm dòng import composable khác (cạnh `import { formatInOrgTz, ... } from '@/composables/use-org-timezone';`), thêm:
```ts
import { useCalls } from '@/composables/use-calls';
```

- [ ] **Step 5: CSS tối thiểu cho `.btn-call-voice`/`.btn-call-video` (tái dùng class `.btn-action` đã có style chung, chỉ thêm màu accent)**

Tìm block CSS `.btn-action` hiện có (tìm bằng `grep -n "\.btn-action {" frontend/src/components/chat/MessageThread.vue`) và thêm ngay sau:
```css
.btn-call-voice, .btn-call-video { color: var(--smax-primary, #1877f2); }
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx vue-tsc -b`
Expected: 0 lỗi mới.

- [ ] **Step 7: Kiểm thử thủ công**

Chạy dev server (theo hướng dẫn WSL2 trong CLAUDE.md — kill process cũ trước nếu repo nằm trên `/mnt/c`, không áp dụng nếu repo native Linux path):
```bash
cd frontend && npm run dev
```
Mở 1 hội thoại 1-1 bất kỳ → xác nhận thấy 2 nút "Gọi"/"Video" trong header → click "Gọi" → tab mới mở `https://zalo.me/{uid}` đúng KH đang xem.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/chat/MessageThread.vue
git commit -s -m "feat(calls): nút click-to-call (Gọi thoại/video) trong header chat"
```

---

## Task 8: Frontend — "Đính kèm ghi âm" + audio player trong card cuộc gọi

**Files:**
- Modify: `frontend/src/components/chat/special-message-renderer.vue` (thêm nút upload + `<audio>` trong `.call-card`, thêm prop `recordingUrl` + emit `attach-recording`)
- Modify: `frontend/src/components/chat/MessageThread.vue` (nghe event `attach-recording` từ renderer, mở file picker, gọi `uploadRecording`, cần biết `callId` — resolve qua `sourceMessageId`)

**Interfaces:**
- Consumes: `useCalls().uploadRecording`, `useCalls().fetchCalls` (Task 6).
- Produces: `special-message-renderer.vue` emit mới `(e: 'attach-recording'): void` khi user bấm nút; nhận thêm prop `recordingUrl?: string | null`.

**Ghi chú quan trọng (giới hạn thật của thiết kế):** card cuộc gọi render trực tiếp từ `message.content` (không có `callId`/`CallRecord` liên kết sẵn ở phía message list — `CallRecord` được tạo BẤT ĐỒNG BỘ, fire-and-forget, sau khi message đã lưu). Nút "Đính kèm ghi âm" match chính xác theo `message.id` qua field `sourceMessageId` đã có sẵn trên `CallRecordDTO` (Task 6) — không cần suy đoán theo thời gian.

- [ ] **Step 1: `special-message-renderer.vue` — thêm prop `recordingUrl`, nút upload, audio player**

Tìm block template `.call-card` (dòng 68-92), thay:
```vue
    <div
      v-else-if="type === 'call'"
      class="call-card"
      :class="{
        missed: isMissed,
        video: isVideo,
        'inbound-missed': isMissed && !isCaller,
        'outbound-noanswer': isMissed && isCaller,
      }"
    >
      <div class="call-icon">
        <v-icon :size="22">{{ callIconName }}</v-icon>
      </div>
      <div class="call-meta">
        <div class="call-title">{{ callLabel }}</div>
        <div v-if="!isMissed && callDuration > 0" class="call-duration">{{ formatDuration(callDuration) }}</div>
        <div v-else-if="isMissed && !isCaller" class="call-subtitle">KH đã gọi nhưng bạn chưa bắt máy</div>
        <div v-else-if="isMissed && isCaller" class="call-subtitle">KH chưa bắt máy</div>
      </div>
      <button
        v-if="isMissed"
        type="button"
        class="call-action"
        :class="{ 'call-action-danger': !isCaller }"
        @click="onCallback"
      >
        <v-icon size="14">{{ isVideo ? 'mdi-video' : 'mdi-phone' }}</v-icon>
        Gọi lại
      </button>
    </div>
```
thành:
```vue
    <div
      v-else-if="type === 'call'"
      class="call-card"
      :class="{
        missed: isMissed,
        video: isVideo,
        'inbound-missed': isMissed && !isCaller,
        'outbound-noanswer': isMissed && isCaller,
      }"
    >
      <div class="call-icon">
        <v-icon :size="22">{{ callIconName }}</v-icon>
      </div>
      <div class="call-meta">
        <div class="call-title">{{ callLabel }}</div>
        <div v-if="!isMissed && callDuration > 0" class="call-duration">{{ formatDuration(callDuration) }}</div>
        <div v-else-if="isMissed && !isCaller" class="call-subtitle">KH đã gọi nhưng bạn chưa bắt máy</div>
        <div v-else-if="isMissed && isCaller" class="call-subtitle">KH chưa bắt máy</div>
        <!-- Ghi âm thủ công (2026-07-23) — zca-js không có audio thật, sale tự thu
             bên ngoài rồi upload gắn vào đúng cuộc gọi này. -->
        <audio v-if="props.recordingUrl" class="call-recording-player" controls :src="props.recordingUrl" />
      </div>
      <button
        v-if="isMissed"
        type="button"
        class="call-action"
        :class="{ 'call-action-danger': !isCaller }"
        @click="onCallback"
      >
        <v-icon size="14">{{ isVideo ? 'mdi-video' : 'mdi-phone' }}</v-icon>
        Gọi lại
      </button>
      <button
        v-if="!props.recordingUrl"
        type="button"
        class="call-action call-action-attach"
        title="Đính kèm file ghi âm cuộc gọi này"
        @click="emit('attach-recording')"
      >
        <v-icon size="14">mdi-paperclip</v-icon>
        Đính kèm ghi âm
      </button>
    </div>
```

Thêm prop trong `<script setup>` (tìm `defineProps` hiện có gần dòng 299 với `content: any`), sửa:
```ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
}>();
```
thành:
```ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  /** URL file ghi âm đã upload (từ CallRecord tương ứng) — null nếu chưa có. */
  recordingUrl?: string | null;
}>();
```

Thêm emit `attach-recording` (tìm `defineEmits` hiện có, sửa):
```ts
const emit = defineEmits<{
  (e: 'callback'): void;
  (e: 'open-profile', uid: string): void;
  (e: 'open-phone', phone: string): void;
  (e: 'attach-recording'): void;
}>();
```

- [ ] **Step 2: CSS cho `.call-recording-player`/`.call-action-attach`**

Tìm block CSS `.call-action` hiện có trong file (cùng file, phần `<style>`), thêm ngay sau:
```css
.call-recording-player { width: 100%; height: 32px; margin-top: 4px; }
.call-action-attach { opacity: 0.8; }
.call-action-attach:hover { opacity: 1; }
```

- [ ] **Step 3: `MessageThread.vue` — wire event `attach-recording` → file picker → upload**

Tìm chỗ `special-message-renderer.vue` được dùng trong template (tìm bằng `grep -n "SpecialMessageRenderer\|special-message-renderer" frontend/src/components/chat/MessageThread.vue`), thêm listener + prop `recording-url` vào thẻ đang có (giữ nguyên các prop/listener cũ, chỉ thêm):
```vue
        :recording-url="callRecordingUrlFor(msg)"
        @attach-recording="onAttachRecording(msg)"
```

Thêm state + hàm xử lý trong `<script setup>` (cạnh `const aiApptPrefill = ref<AiPrefill | null>(null);`):
```ts
// ── Đính kèm ghi âm cuộc gọi (2026-07-23) ─────────────────────────────────
const { calls: callRecords, fetchCalls: fetchCallRecords, uploadRecording } = useCalls();
let callRecordsLoadedFor: string | null = null;

async function ensureCallRecordsLoaded() {
  const contactId = props.conversation?.contact?.id;
  if (!contactId || callRecordsLoadedFor === contactId) return;
  await fetchCallRecords(contactId);
  callRecordsLoadedFor = contactId;
}

function callRecordingUrlFor(msg: Message): string | null {
  const rec = callRecords.value.find((c) => c.sourceMessageId === msg.id);
  return rec?.recordingUrl ?? null;
}

async function onAttachRecording(msg: Message) {
  await ensureCallRecordsLoaded();
  const rec = callRecords.value.find((c) => c.sourceMessageId === msg.id);
  if (!rec) {
    toast.push('Chưa tìm thấy bản ghi cuộc gọi này (thử tải lại hội thoại)');
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/aac';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await uploadRecording(rec.id, file);
      await fetchCallRecords(props.conversation!.contact!.id);
      toast.push('Đã đính kèm ghi âm');
    } catch (err) {
      console.error('[chat] upload recording error', err);
      toast.push('Upload ghi âm thất bại');
    }
  };
  input.click();
}
```

Gọi `ensureCallRecordsLoaded()` khi conversation đổi — tìm `watch` hiện có theo dõi `props.conversation?.id` (nếu không có sẵn, thêm mới cạnh các `watch` khác trong file):
```ts
watch(() => props.conversation?.id, () => {
  callRecordsLoadedFor = null;
  void ensureCallRecordsLoaded();
}, { immediate: true });
```

- [ ] **Step 4: Import `useCalls` (nếu chưa import ở Task 7 trong cùng file thì thêm; nếu đã import thì bỏ qua bước này)**

Xác nhận dòng `import { useCalls } from '@/composables/use-calls';` đã có (thêm ở Task 7 Step 4) — nếu component tách 2 chỗ dùng biến khác nhau (`onClickToCall` dùng instance riêng, phần này dùng instance `callRecords` chia sẻ), giữ nguyên 1 import, 2 lần gọi `useCalls()` là 2 state riêng biệt (composable không phải singleton) — với `onClickToCall` không cần đọc `calls` nên giữ nguyên gọi riêng lẻ trong Task 7 là đúng, không cần sửa lại.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx vue-tsc -b`
Expected: 0 lỗi mới.

- [ ] **Step 6: Kiểm thử thủ công**

`npm run dev` → mở hội thoại có ít nhất 1 tin nhắn cuộc gọi thật (contentType='call', nếu môi trường dev chưa có dữ liệu thật, tạo tạm 1 row `CallRecord` qua Prisma Studio để test upload) → bấm "Đính kèm ghi âm" → chọn file mp3 bất kỳ → xác nhận card hiện `<audio>` player nghe được.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/special-message-renderer.vue frontend/src/components/chat/MessageThread.vue frontend/src/composables/use-calls.ts
git commit -s -m "feat(calls): đính kèm + phát lại ghi âm ngay trong card cuộc gọi"
```

---

## Task 9: Frontend — component `ChatCallHistory.vue` trong tab Activity

**Files:**
- Create: `frontend/src/components/chat/ChatCallHistory.vue`
- Modify: `frontend/src/components/chat/ChatContactPanel.vue` (thêm component vào tab `activity`, cạnh `ChatAppointments`)

**Interfaces:**
- Consumes: `useCalls()` (Task 6).
- Produces: component nhận `contactId: string`, tự fetch — không cần prop-drill từ `useChatContactPanel` (đơn giản hoá, tránh phình composable đang lớn sẵn).

- [ ] **Step 1: Viết `ChatCallHistory.vue`**

Tạo `frontend/src/components/chat/ChatCallHistory.vue`:
```vue
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="chat-call-history">
    <v-divider class="my-3" />
    <div class="d-flex align-center mb-2">
      <v-icon size="16" color="primary" class="mr-1">mdi-phone-clock</v-icon>
      <span class="text-caption font-weight-bold">Lịch sử cuộc gọi ({{ calls.length }})</span>
    </div>

    <div v-if="loading" class="text-caption text-medium-emphasis">Đang tải…</div>
    <div v-else-if="!calls.length" class="text-caption text-medium-emphasis">
      Chưa có cuộc gọi nào.
    </div>

    <div v-for="call in calls" :key="call.id" class="call-history-row">
      <v-icon :size="18" :color="call.status === 'missed' ? 'error' : 'success'">
        {{ callIcon(call) }}
      </v-icon>
      <div class="chr-meta">
        <div class="chr-title">{{ callLabel(call) }}</div>
        <div class="chr-sub">
          {{ formatDate(call.occurredAt) }}
          <span v-if="call.durationSec">· {{ formatDuration(call.durationSec) }}</span>
        </div>
      </div>
      <audio v-if="call.recordingUrl" class="chr-audio" controls :src="call.recordingUrl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useCalls, type CallRecordDTO } from '@/composables/use-calls';

const props = defineProps<{ contactId: string | null }>();

const { calls, loading, fetchCalls } = useCalls();

async function load() {
  if (props.contactId) await fetchCalls(props.contactId);
}

onMounted(load);
watch(() => props.contactId, load);

function callLabel(call: CallRecordDTO): string {
  const dir = call.direction === 'outbound' ? 'đi' : 'đến';
  const type = call.callType === 'video' ? 'video' : 'thoại';
  if (call.status === 'missed') return `Cuộc gọi ${type} nhỡ`;
  return `Cuộc gọi ${type} ${dir}`;
}

function callIcon(call: CallRecordDTO): string {
  if (call.status === 'missed') return 'mdi-phone-missed';
  if (call.callType === 'video') return 'mdi-video';
  return call.direction === 'outbound' ? 'mdi-phone-outgoing' : 'mdi-phone-incoming';
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} giây`;
  if (s === 0) return `${m} phút`;
  return `${m} phút ${s} giây`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
</script>

<style scoped>
.call-history-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--smax-grey-100, #eee);
}
.chr-meta { flex: 1; min-width: 0; }
.chr-title { font-size: 13px; font-weight: 600; }
.chr-sub { font-size: 11px; color: var(--smax-grey-500, #888); }
.chr-audio { max-width: 160px; height: 28px; }
</style>
```

- [ ] **Step 2: Chèn vào `ChatContactPanel.vue`, tab Activity**

Tìm đoạn (dòng 439-446):
```vue
        <!-- Lịch hẹn -->
        <ChatAppointments
          v-if="props.contactId"
          :contact-id="props.contactId"
          :contact-name="headerFullName"
          :appointments="contactAppointments"
          @refresh="reloadAppointments"
        />
```

Thêm ngay sau (giữ nguyên `ChatAppointments`):
```vue
        <!-- Lịch hẹn -->
        <ChatAppointments
          v-if="props.contactId"
          :contact-id="props.contactId"
          :contact-name="headerFullName"
          :appointments="contactAppointments"
          @refresh="reloadAppointments"
        />

        <!-- Lịch sử cuộc gọi (2026-07-23) -->
        <ChatCallHistory v-if="props.contactId" :contact-id="props.contactId" />
```

Thêm import (cạnh `import ChatAppointments from './ChatAppointments.vue';`, dòng 588):
```ts
import ChatAppointments from './ChatAppointments.vue';
import ChatCallHistory from './ChatCallHistory.vue';
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx vue-tsc -b`
Expected: 0 lỗi.

- [ ] **Step 4: Build đầy đủ (bắt lỗi SFC/CSS theo yêu cầu CONTRIBUTING.md)**

Run: `cd frontend && npm run build`
Expected: build thành công.

- [ ] **Step 5: Kiểm thử thủ công**

`npm run dev` → mở 1 contact có `CallRecord` (thật hoặc tạo tay qua Prisma Studio để test) → mở tab "Hoạt động" (activity) trong panel cột 4 → xác nhận thấy section "Lịch sử cuộc gọi" với đúng số lượng, icon, thời lượng; nếu có `recordingUrl` thì có audio player nghe được.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/ChatCallHistory.vue frontend/src/components/chat/ChatContactPanel.vue
git commit -s -m "feat(calls): tab Lịch sử cuộc gọi trong panel liên hệ (cạnh Lịch hẹn)"
```

---

## Xác minh cuối (toàn bộ plan)

Sau khi xong cả 9 task:

```bash
cd backend && npx tsc --noEmit && npx vitest run
cd ../frontend && npx vue-tsc -b && npm run build && npx vitest run
```

Expected: cả 2 vế PASS/build sạch, không có test FAIL nào (kể cả test suite đã có từ trước, đảm bảo không hồi quy).

Kiểm thử thủ công tổng: mở 1 hội thoại 1-1 → bấm "Gọi" → Zalo mở đúng người → giả lập/gọi thật 1 cuộc giữa 2 nick test → card cuộc gọi xuất hiện trong chat + entry mới trong "Lịch sử cuộc gọi" ở panel liên hệ → bấm "Đính kèm ghi âm" → chọn file mp3 → nghe lại được cả ở card trong chat lẫn ở tab Lịch sử cuộc gọi.
