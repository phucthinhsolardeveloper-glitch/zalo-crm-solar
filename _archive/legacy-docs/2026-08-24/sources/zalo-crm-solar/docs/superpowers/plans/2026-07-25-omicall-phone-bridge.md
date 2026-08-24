# Omicall Phone Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Stringee-based browser softphone with Omicall Web SDK v3, covering internal calls (agent↔agent), web→phone (agent dials PSTN), and phone→web (PSTN caller reaches an agent's browser).

**Architecture:** Omicall's PBX (not our backend) routes calls — the backend's job is issuing per-agent SIP connect credentials, providing the internal directory, persisting call history (client-initiated + webhook-reconciled), and an admin UI to assign one Omicall extension per CRM user. Frontend registers directly with `OMICallSDK` and dials/answers through it; no server-side call-routing scripting.

**Tech Stack:** Fastify + Prisma (backend), Vue 3 `<script setup>` + Vuetify 3 (frontend), Omicall Web SDK v3 (CDN), AES-256-GCM (`backend/src/shared/crypto/aes-gcm.ts`) for extension password at rest.

## Global Constraints

- Work happens ONLY inside this worktree (`feat/omicall-phone-bridge`, based on `main`). Never touch the root checkout or `feat/stringee-phone-bridge` — that branch has unrelated in-progress work and must stay untouched.
- Full replace of Stringee: delete `stringee-token.ts`, `stringee-token.test.ts` content is ported (not kept), no Stringee code paths remain in this module.
- `TelephonyCall.provider` already exists (`String @default("stringee")` in current schema) — new rows use `'omicall'`; no need to rename the column.
- Vietnamese UI copy/error strings, matching existing style in `telephony-routes.ts` / `TelephonySoftphone.vue`.
- Every backend module file starts with `// SPDX-License-Identifier: AGPL-3.0-or-later` (copy header from the file it replaces).
- Run `npx tsc --noEmit` (backend) / `npx vue-tsc -b` (frontend) before considering any task done — CLAUDE.md requires this pre-PR; catching it per-task is cheaper than at the end.

---

### Task 1: Schema migration — Omicall extension + external call fields

**Files:**
- Modify: `backend/prisma/schema.prisma` (`User` model ~line 205-283, `TelephonyCall` model ~line 327-355)
- Create: migration via `npx prisma migrate dev --name omicall_telephony`

**Interfaces:**
- Produces: `User.omicallExtension: string | null`, `User.omicallExtensionSecret: string | null` (ciphertext), `TelephonyCall.contactId: string | null`, `TelephonyCall.externalNumber: string | null`, `TelephonyCall.peerUserId` becomes optional.

- [ ] **Step 1: Edit the `User` model** — insert before the `isActive` field (after `lastLoginAt`):

```prisma
  // Phase Omicall telephony 2026-07-25 — mỗi agent 1 extension Omicall (SIP user),
  // provision thủ công trên Omicall dashboard, admin gán qua Settings > Users.
  // omicallExtensionSecret = sipPassword mã hoá AES-256-GCM (aes-gcm.ts), KHÔNG bao giờ trả plaintext qua API GET.
  omicallExtension       String?              @map("omicall_extension")
  omicallExtensionSecret String?              @map("omicall_extension_secret")
```

- [ ] **Step 2: Edit the `TelephonyCall` model** — change `peerUserId` to optional, add `contactId`/`externalNumber`, add the `contact` relation and default provider:

```prisma
model TelephonyCall {
  id             String    @id @default(uuid())
  orgId          String    @map("org_id")
  ownerUserId    String    @map("owner_user_id")
  peerUserId     String?   @map("peer_user_id")
  contactId      String?   @map("contact_id")
  externalNumber String?   @map("external_number")
  provider       String    @default("omicall")
  providerCallId String?   @map("provider_call_id")
  direction      String
  status         String    @default("initiated")
  fromIdentity   String    @map("from_identity")
  toIdentity     String    @map("to_identity")
  startedAt      DateTime  @default(now()) @map("started_at")
  answeredAt     DateTime? @map("answered_at")
  endedAt        DateTime? @map("ended_at")
  durationSec    Int?      @map("duration_sec")
  endReason      String?   @map("end_reason")
  recordingId    String?   @map("recording_id")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  org       Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  ownerUser User         @relation("TelephonyCallOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  peerUser  User?        @relation("TelephonyCallPeer", fields: [peerUserId], references: [id], onDelete: Cascade)
  contact   Contact?     @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@unique([ownerUserId, providerCallId])
  @@index([orgId, ownerUserId, startedAt(sort: Desc)])
  @@index([orgId, peerUserId, startedAt(sort: Desc)])
  @@index([orgId, externalNumber, startedAt(sort: Desc)])
  @@index([contactId, startedAt(sort: Desc)])
  @@map("telephony_calls")
}
```

- [ ] **Step 3: Add the back-relation on `Contact`** — find `model Contact {` and add near its other back-relations:

```prisma
  telephonyCalls TelephonyCall[]
```

- [ ] **Step 4: Generate the migration**

Run: `cd backend && npx prisma migrate dev --name omicall_telephony`
Expected: creates `backend/prisma/migrations/<timestamp>_omicall_telephony/migration.sql`, applies cleanly against the dev DB (needs `docker compose -f docker-compose.dev.yml up -d` running first if not already).

- [ ] **Step 5: Regenerate the Prisma client and typecheck**

Run: `npx prisma generate && npx tsc --noEmit`
Expected: no errors (existing `stringee-token.ts`/`telephony-routes.ts` still reference old shape — that's fine, they get rewritten in later tasks; if `tsc` fails only inside `modules/telephony/`, that's expected at this point).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(telephony): add Omicall extension fields + external call support to schema"
```

---

### Task 2: Config — Omicall env vars

**Files:**
- Modify: `backend/src/config/index.ts` (~lines 51-56, the `/* Stringee WebRTC softphone */` block)

**Interfaces:**
- Produces: `config.omicallEnabled: boolean`, `config.omicallDomain: string`, `config.omicallHotline: string`, `config.omicallWebhookSecret: string`

- [ ] **Step 1: Replace the Stringee config block**

Replace:
```ts
  /* Stringee WebRTC softphone. Secret key never leaves the backend. */
  stringeeEnabled: (envValue('STRINGEE_ENABLED') || 'false').toLowerCase() === 'true',
  stringeeApiKeySid: envValue('STRINGEE_API_KEY_SID') || '',
  stringeeApiKeySecret: envValue('STRINGEE_API_KEY_SECRET') || '',
  stringeeProjectId: envValue('STRINGEE_PROJECT_ID') || '',
  stringeeFromNumber: envValue('STRINGEE_FROM_NUMBER') || '',
```

With:
```ts
  /* Omicall WebRTC softphone. sipRealm + per-agent sipUser/sipPassword —
   * extension password stored encrypted on User, never a server-signed token. */
  omicallEnabled: (envValue('OMICALL_ENABLED') || 'false').toLowerCase() === 'true',
  omicallDomain: envValue('OMICALL_DOMAIN') || '',
  omicallHotline: envValue('OMICALL_HOTLINE') || '',
  // Embedded as ?key=... in the webhook URL registered on the Omicall dashboard —
  // Omicall webhooks have no built-in signature/HMAC, this is our own shared secret.
  omicallWebhookSecret: envValue('OMICALL_WEBHOOK_SECRET') || '',
```

- [ ] **Step 2: Grep for any other `stringee` references in config-adjacent files** (`.env.example` if present)

Run: `grep -rn "STRINGEE" backend/.env.example 2>/dev/null || echo "no .env.example"`
If found, replace with the `OMICALL_*` equivalents (mirror the same 4 keys).

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: errors only in files still referencing `config.stringee*` (telephony module — fixed in later tasks).

- [ ] **Step 4: Commit**

```bash
git add backend/src/config/index.ts backend/.env.example
git commit -m "feat(telephony): swap Stringee env config for Omicall"
```

---

### Task 3: `omicall-token.ts` — extension credential encrypt/decrypt

**Files:**
- Create: `backend/src/modules/telephony/omicall-token.ts`
- Delete: `backend/src/modules/telephony/stringee-token.ts`
- Test: `backend/tests/omicall-token.test.ts`
- Delete: `backend/tests/stringee-token.test.ts`

**Interfaces:**
- Produces: `encryptOmicallSecret(plainPassword: string): string`, `decryptOmicallSecret(ciphertext: string): string`

- [ ] **Step 1: Write the failing test** (`backend/tests/omicall-token.test.ts`)

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { decryptOmicallSecret, encryptOmicallSecret } from '../src/modules/telephony/omicall-token.js';

describe('omicall-token', () => {
  it('round-trips a sip password through encrypt/decrypt', () => {
    const plain = 'S3cretExtP@ss!';
    const ciphertext = encryptOmicallSecret(plain);
    expect(ciphertext).not.toBe(plain);
    expect(ciphertext.split(':')).toHaveLength(3);
    expect(decryptOmicallSecret(ciphertext)).toBe(plain);
  });

  it('produces different ciphertext for the same plaintext each call (random IV)', () => {
    const a = encryptOmicallSecret('same-password');
    const b = encryptOmicallSecret('same-password');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && npx vitest run tests/omicall-token.test.ts`
Expected: FAIL — `omicall-token.js` does not exist.

- [ ] **Step 3: Implement**

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * omicall-token.ts — encrypt/decrypt the per-agent Omicall extension password
 * (sipPassword) at rest. Unlike Stringee's server-signed JWT, Omicall Web SDK
 * registration needs the extension's real, durable SIP credential — there is
 * no scoped/expiring token to mint, so the secret itself must be stored.
 */
import { config } from '../../config/index.js';
import { decrypt, encrypt } from '../../shared/crypto/aes-gcm.js';

export function encryptOmicallSecret(plainPassword: string): string {
  return encrypt(plainPassword, config.encryptionKey);
}

export function decryptOmicallSecret(ciphertext: string): string {
  return decrypt(ciphertext, config.encryptionKey);
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && npx vitest run tests/omicall-token.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Delete the Stringee files this replaces**

Run: `rm backend/src/modules/telephony/stringee-token.ts backend/tests/stringee-token.test.ts`

- [ ] **Step 6: Commit**

```bash
git add -A backend/src/modules/telephony/omicall-token.ts backend/tests/omicall-token.test.ts
git add backend/src/modules/telephony/stringee-token.ts backend/tests/stringee-token.test.ts
git commit -m "feat(telephony): replace Stringee JWT signing with Omicall secret encrypt/decrypt"
```

---

### Task 4: Webhook status mapping — `mapOmicallEventStatus`

**Files:**
- Create: `backend/src/modules/telephony/omicall-status.ts`
- Test: `backend/tests/omicall-status.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, standalone — kept separate from the route file so Task 5 can import + unit-test it in isolation)
- Produces: `mapOmicallEventStatus(body: Record<string, unknown>): string | null` returning one of `'initiated' | 'ringing' | 'answered' | 'completed' | 'rejected' | 'missed' | 'failed'` or `null` for an unrecognized state.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { mapOmicallEventStatus } from '../src/modules/telephony/omicall-status.js';

describe('mapOmicallEventStatus', () => {
  it('maps create/early to initiated', () => {
    expect(mapOmicallEventStatus({ state: 'create' })).toBe('initiated');
    expect(mapOmicallEventStatus({ state: 'early' })).toBe('initiated');
  });
  it('maps ringing to ringing', () => {
    expect(mapOmicallEventStatus({ state: 'ringing' })).toBe('ringing');
  });
  it('maps answered to answered', () => {
    expect(mapOmicallEventStatus({ state: 'answered' })).toBe('answered');
  });
  it('maps hangup with bill_sec > 0 to completed', () => {
    expect(mapOmicallEventStatus({ state: 'hangup', bill_sec: 42 })).toBe('completed');
  });
  it('maps hangup with 0 bill_sec and answer_sec > 0 to rejected (agent declined after ring)', () => {
    expect(mapOmicallEventStatus({ state: 'hangup', bill_sec: 0, answer_sec: 0 })).toBe('missed');
  });
  it('returns null for unrecognized state', () => {
    expect(mapOmicallEventStatus({ state: 'weird_unknown' })).toBeNull();
    expect(mapOmicallEventStatus({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && npx vitest run tests/omicall-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * omicall-status.ts — maps an Omicall call-webhook `state` field to our
 * internal TelephonyCall.status enum. `bill_sec` (>0 once the call was
 * actually connected and billed) is the signal that distinguishes a real
 * hangup (completed) from a call that rang out unanswered (missed).
 */
export function mapOmicallEventStatus(body: Record<string, unknown>): string | null {
  const state = String(body.state || '').toLowerCase();
  const billSec = Number(body.bill_sec ?? 0);

  if (state === 'create' || state === 'early') return 'initiated';
  if (state === 'ringing') return 'ringing';
  if (state === 'answered') return 'answered';
  if (state === 'hangup') return billSec > 0 ? 'completed' : 'missed';
  return null;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && npx vitest run tests/omicall-status.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/telephony/omicall-status.ts backend/tests/omicall-status.test.ts
git commit -m "feat(telephony): add Omicall webhook state -> call status mapper"
```

---

### Task 5: `telephony-routes.ts` rewrite — authenticated connect-config + call log CRUD

**Files:**
- Modify: `backend/src/modules/telephony/telephony-routes.ts` (full rewrite)

**Interfaces:**
- Consumes: `decryptOmicallSecret` (Task 3, unused here — encryption only decrypted server-side to hand to this user's own browser), `config.omicallEnabled/omicallDomain/omicallHotline` (Task 2), `normalizePhone`/`phoneVariants` from `backend/src/shared/utils/phone.ts` (existing)
- Produces: `GET /api/v1/telephony/omicall/connect-config`, `GET /api/v1/telephony/calls`, `POST /api/v1/telephony/calls`, `PATCH /api/v1/telephony/calls/:id` — same route function name `telephonyRoutes` exported, so `app.ts` registration doesn't need to change.

- [ ] **Step 1: Replace the file contents**

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware, requireActiveUser } from '../auth/auth-middleware.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { decryptOmicallSecret } from './omicall-token.js';

const DIRECTIONS = new Set(['inbound', 'outbound']);
const STATUSES = new Set(['initiated', 'ringing', 'answered', 'completed', 'rejected', 'missed', 'failed']);

function ensureConfigured(reply: FastifyReply): boolean {
  if (!config.omicallEnabled) {
    void reply.status(503).send({ error: 'Tổng đài Omicall chưa được bật' });
    return false;
  }
  if (!config.omicallDomain) {
    void reply.status(503).send({ error: 'Thiếu OMICALL_DOMAIN' });
    return false;
  }
  return true;
}

export async function telephonyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireActiveUser);

  app.get('/api/v1/telephony/omicall/connect-config', async (request, reply) => {
    if (!ensureConfigured(reply)) return;
    const current = request.user!;
    const me = await prisma.user.findFirst({
      where: { id: current.id, orgId: current.orgId },
      select: { omicallExtension: true, omicallExtensionSecret: true },
    });
    if (!me?.omicallExtension || !me.omicallExtensionSecret) {
      return reply.status(503).send({ error: 'Bạn chưa được gán extension Omicall — liên hệ quản trị viên' });
    }
    const peers = await prisma.user.findMany({
      where: { orgId: current.orgId, isActive: true, id: { not: current.id }, omicallExtension: { not: null } },
      select: { id: true, fullName: true, avatarUrl: true, role: true, omicallExtension: true },
      orderBy: { fullName: 'asc' },
    });
    return {
      enabled: true,
      sipRealm: config.omicallDomain,
      sipUser: me.omicallExtension,
      sipPassword: decryptOmicallSecret(me.omicallExtensionSecret),
      hotline: config.omicallHotline || null,
      peers,
    };
  });

  app.get('/api/v1/telephony/calls', async (request) => {
    const current = request.user!;
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
    const calls = await prisma.telephonyCall.findMany({
      where: { orgId: current.orgId, ownerUserId: current.id },
      include: {
        peerUser: { select: { id: true, fullName: true, avatarUrl: true } },
        contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return { calls };
  });

  app.post('/api/v1/telephony/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureConfigured(reply)) return;
    const current = request.user!;
    const body = request.body as { peerUserId?: string; phoneNumber?: string; direction?: string; providerCallId?: string };
    if (!body.direction || !DIRECTIONS.has(body.direction) || Boolean(body.peerUserId) === Boolean(body.phoneNumber)) {
      return reply.status(400).send({ error: 'Cần đúng một peerUserId hoặc phoneNumber và direction hợp lệ' });
    }
    let peer: { id: string; omicallExtension: string | null } | null = null;
    let contact: { id: string } | null = null;
    let externalNumber: string | null = null;
    if (body.peerUserId) {
      peer = await prisma.user.findFirst({
        where: { id: body.peerUserId, orgId: current.orgId, isActive: true },
        select: { id: true, omicallExtension: true },
      });
      if (!peer || peer.id === current.id) return reply.status(404).send({ error: 'Không tìm thấy nhân viên nhận cuộc gọi' });
    } else {
      externalNumber = normalizePhone(body.phoneNumber);
      if (!externalNumber || !externalNumber.startsWith('84') || externalNumber.length < 11 || externalNumber.length > 12) {
        return reply.status(400).send({ error: 'Số điện thoại Việt Nam không hợp lệ' });
      }
      const variants = phoneVariants(externalNumber);
      contact = await prisma.contact.findFirst({
        where: {
          orgId: current.orgId,
          mergedInto: null,
          OR: [{ phoneNormalized: externalNumber }, { phone: { in: variants } }, { phone2: { in: variants } }, { phone3: { in: variants } }],
        },
        select: { id: true },
      });
    }
    const ownExt = (await prisma.user.findFirst({ where: { id: current.id }, select: { omicallExtension: true } }))?.omicallExtension || '';
    const peerExt = peer?.omicallExtension || null;
    const fromIdentity = body.direction === 'inbound' ? (peerExt || externalNumber!) : ownExt;
    const toIdentity = body.direction === 'inbound' ? ownExt : (peerExt || externalNumber!);
    const call = await prisma.telephonyCall.create({
      data: {
        orgId: current.orgId,
        ownerUserId: current.id,
        peerUserId: peer?.id || null,
        contactId: contact?.id || null,
        externalNumber,
        provider: 'omicall',
        providerCallId: body.providerCallId || null,
        direction: body.direction,
        status: body.direction === 'inbound' ? 'ringing' : 'initiated',
        fromIdentity,
        toIdentity,
      },
      include: {
        peerUser: { select: { id: true, fullName: true, avatarUrl: true } },
        contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } },
      },
    });
    return reply.status(201).send(call);
  });

  app.patch('/api/v1/telephony/calls/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const current = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: string;
      providerCallId?: string;
      durationSec?: number;
      endReason?: string;
    };
    if (body.status && !STATUSES.has(body.status)) return reply.status(400).send({ error: 'Trạng thái cuộc gọi không hợp lệ' });
    const existing = await prisma.telephonyCall.findFirst({ where: { id, orgId: current.orgId, ownerUserId: current.id } });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy cuộc gọi' });
    const now = new Date();
    const ending = body.status && ['completed', 'rejected', 'missed', 'failed'].includes(body.status);
    const call = await prisma.telephonyCall.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.providerCallId ? { providerCallId: body.providerCallId } : {}),
        ...(body.status === 'answered' && !existing.answeredAt ? { answeredAt: now } : {}),
        ...(ending && !existing.endedAt ? { endedAt: now } : {}),
        ...(Number.isFinite(body.durationSec) ? { durationSec: Math.max(0, Math.round(body.durationSec!)) } : {}),
        ...(body.endReason ? { endReason: body.endReason.slice(0, 255) } : {}),
      },
    });
    return call;
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors in `modules/telephony/telephony-routes.ts` (errors may remain in `omicall-public-routes.ts` if Task 6 isn't done yet — fine).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/telephony/telephony-routes.ts
git commit -m "feat(telephony): rewrite telephony-routes.ts for Omicall connect-config + call log"
```

---

### Task 6: `omicall-public-routes.ts` — webhook receiver

**Files:**
- Create: `backend/src/modules/telephony/omicall-public-routes.ts`
- Test: `backend/tests/omicall-webhook.test.ts`
- Modify: `backend/src/app.ts` (register the new route module)

**Interfaces:**
- Consumes: `mapOmicallEventStatus` (Task 4), `normalizePhone`/`phoneVariants` (existing), `config.omicallWebhookSecret` (Task 2)
- Produces: `omicallPublicRoutes(app: FastifyInstance)` exported for `app.ts`, `POST /api/v1/telephony/omicall/events`

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    telephonyCall: { updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    user: { findMany: vi.fn() },
    contact: { findFirst: vi.fn() },
  },
}));
vi.mock('../src/config/index.js', () => ({
  config: { omicallWebhookSecret: 'test-secret', omicallEnabled: true, omicallDomain: 'demo01', omicallHotline: '' },
}));

import Fastify from 'fastify';
import { prisma } from '../src/shared/database/prisma-client.js';
import { omicallPublicRoutes } from '../src/modules/telephony/omicall-public-routes.js';

describe('POST /api/v1/telephony/omicall/events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects requests with a missing/wrong webhook key', async () => {
    const app = Fastify();
    await app.register(omicallPublicRoutes);
    const res = await app.inject({ method: 'POST', url: '/api/v1/telephony/omicall/events', payload: { state: 'ringing' } });
    expect(res.statusCode).toBe(403);
  });

  it('accepts a correctly-keyed event and updates matching call rows by transaction_id', async () => {
    (prisma.telephonyCall.updateMany as any).mockResolvedValue({ count: 1 });
    const app = Fastify();
    await app.register(omicallPublicRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telephony/omicall/events?key=test-secret',
      payload: { state: 'answered', transaction_id: 'tx-1', extension: '101' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.telephonyCall.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerCallId: 'tx-1' } }),
    );
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd backend && npx vitest run tests/omicall-webhook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { mapOmicallEventStatus } from './omicall-status.js';

function checkWebhookKey(request: FastifyRequest, reply: FastifyReply): boolean {
  const query = request.query as Record<string, string | undefined>;
  if (!config.omicallWebhookSecret || query.key !== config.omicallWebhookSecret) {
    void reply.status(403).send({ error: 'Sai webhook key' });
    return false;
  }
  return true;
}

export async function omicallPublicRoutes(app: FastifyInstance) {
  app.post('/api/v1/telephony/omicall/events', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkWebhookKey(request, reply)) return;
    const body = (request.body || {}) as Record<string, any>;
    const transactionId = String(body.transaction_id || body.call_uuid || '');
    const status = mapOmicallEventStatus(body);
    if (!transactionId || !status) return { success: true, matched: 0 };

    const now = new Date();
    const terminal = ['completed', 'rejected', 'missed', 'failed'].includes(status);
    const billSec = Number(body.bill_sec ?? 0);
    const result = await prisma.telephonyCall.updateMany({
      where: { providerCallId: transactionId },
      data: {
        status,
        ...(status === 'answered' ? { answeredAt: now } : {}),
        ...(terminal ? { endedAt: now } : {}),
        ...(Number.isFinite(billSec) && billSec > 0 ? { durationSec: Math.round(billSec) } : {}),
        ...(body.recording_file_url ? { recordingId: String(body.recording_file_url) } : {}),
      },
    });

    // Pure inbound (phone -> web) or the agent's browser didn't create a log
    // row in time: no existing row matched this transaction_id — create one
    // from the webhook payload itself.
    if (result.count === 0 && status !== 'initiated') {
      const extension = String(body.extension || '');
      const phoneNumber = normalizePhone(String(body.phone_number || ''));
      const direction = String(body.direction || '') === 'outbound' ? 'outbound' : 'inbound';
      if (extension && phoneNumber) {
        const owner = await prisma.user.findFirst({
          where: { omicallExtension: extension, isActive: true },
          select: { id: true, orgId: true },
        });
        if (owner) {
          const variants = phoneVariants(phoneNumber);
          const contact = await prisma.contact.findFirst({
            where: {
              orgId: owner.orgId,
              mergedInto: null,
              OR: [{ phoneNormalized: phoneNumber }, { phone: { in: variants } }, { phone2: { in: variants } }, { phone3: { in: variants } }],
            },
            select: { id: true },
          });
          await prisma.telephonyCall.create({
            data: {
              orgId: owner.orgId,
              ownerUserId: owner.id,
              contactId: contact?.id || null,
              externalNumber: phoneNumber,
              provider: 'omicall',
              providerCallId: transactionId,
              direction,
              status,
              fromIdentity: direction === 'inbound' ? phoneNumber : extension,
              toIdentity: direction === 'inbound' ? extension : phoneNumber,
              answeredAt: status === 'answered' ? now : undefined,
              endedAt: terminal ? now : undefined,
            },
          });
        }
      }
    }

    return { success: true, matched: result.count };
  });
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd backend && npx vitest run tests/omicall-webhook.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Register the route in `app.ts`**

Find the existing `import { telephonyRoutes } from './modules/telephony/telephony-routes.js';` (line ~104) and the `await app.register(telephonyRoutes);` (line ~311). Add alongside:

```ts
import { omicallPublicRoutes } from './modules/telephony/omicall-public-routes.js';
```
(near the `telephonyRoutes` import)

```ts
await app.register(omicallPublicRoutes);
```
(near the `telephonyRoutes` registration — register it BEFORE `telephonyRoutes` if there's any global auth preHandler registered on the app in between; verify by checking what's registered around line 311 first, since this route must stay outside any `authMiddleware` preHandler chain, exactly like the old `stringeePublicRoutes` was.)

- [ ] **Step 6: Typecheck + run the full telephony test suite**

Run: `cd backend && npx tsc --noEmit && npx vitest run tests/omicall-token.test.ts tests/omicall-status.test.ts tests/omicall-webhook.test.ts`
Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/telephony/omicall-public-routes.ts backend/tests/omicall-webhook.test.ts backend/src/app.ts
git commit -m "feat(telephony): add Omicall webhook receiver, register in app.ts"
```

---

### Task 7: Admin API — assign extension to a user

**Files:**
- Modify: `backend/src/modules/auth/user-routes.ts` (add a new route near the existing `PUT /api/v1/users/:id/password`, ~line 214)

**Interfaces:**
- Consumes: `encryptOmicallSecret` (Task 3)
- Produces: `PUT /api/v1/users/:id/omicall-extension`, admin/owner only, body `{ extension: string | null, password?: string }`

- [ ] **Step 1: Read the existing `PUT /api/v1/users/:id/password` handler** (`backend/src/modules/auth/user-routes.ts:214`) to match its RBAC-check and response conventions exactly.

- [ ] **Step 2: Add the import** at the top of `user-routes.ts`:

```ts
import { encryptOmicallSecret } from '../telephony/omicall-token.js';
```

- [ ] **Step 3: Add the route**, placed directly after the `PUT /api/v1/users/:id/password` handler closes:

```ts
  // PUT /api/v1/users/:id/omicall-extension — assign/clear a user's Omicall SIP
  // extension (owner/admin only). extension=null clears assignment. password is
  // write-only: never echoed back on any GET/PUT response for this user.
  app.put('/api/v1/users/:id/omicall-extension', async (request: FastifyRequest, reply: FastifyReply) => {
    const currentUser = request.user!;
    if (!['owner', 'admin'].includes(currentUser.role)) {
      return reply.status(403).send({ error: 'Không có quyền' });
    }
    const { id } = request.params as { id: string };
    const { extension, password } = request.body as { extension?: string | null; password?: string };

    if (extension === null || extension === '') {
      await prisma.user.update({
        where: { id, orgId: currentUser.orgId },
        data: { omicallExtension: null, omicallExtensionSecret: null },
      });
      return { success: true };
    }
    if (!extension || !password) {
      return reply.status(400).send({ error: 'Cần extension và password Omicall' });
    }
    const dup = await prisma.user.findFirst({ where: { orgId: currentUser.orgId, omicallExtension: extension, id: { not: id } } });
    if (dup) return reply.status(409).send({ error: `Extension "${extension}" đã gán cho nhân viên khác` });

    await prisma.user.update({
      where: { id, orgId: currentUser.orgId },
      data: { omicallExtension: extension, omicallExtensionSecret: encryptOmicallSecret(password) },
    });
    return { success: true };
  });
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/auth/user-routes.ts
git commit -m "feat(telephony): admin API to assign Omicall extension per user"
```

---

### Task 8: Admin UI — extension field in user edit panel

**Files:**
- Modify: `frontend/src/components/rbac/UserEditPanel.vue`

**Interfaces:**
- Consumes: `PUT /api/v1/users/:id/omicall-extension` (Task 7)

- [ ] **Step 1: Read the file first** to find the existing password-reset section (calls `PUT /api/v1/users/:id/password`) — mirror its layout/styling exactly (same section-title pattern, same button/input classes).

- [ ] **Step 2: Add two fields below the existing password-reset section**, gated the same way (only visible when `currentUser.role` is `owner`/`admin`):
  - A text input bound to a local ref `omicallExtension`, pre-filled from the user's current `omicallExtension` if the edit panel's user object includes it (if it doesn't yet, add `omicallExtension: true` to whatever `select`/query fetches the user list this panel edits — find that query in `frontend/src/composables/use-users.ts` or `frontend/src/stores/rbac.ts` and extend it, plus the backend list endpoint's `select` clause).
  - A password input (type="password", placeholder "Để trống nếu không đổi"), local ref `omicallPassword`.
  - A submit button calling:
    ```ts
    async function saveOmicallExtension() {
      await api.put(`/users/${user.id}/omicall-extension`, {
        extension: omicallExtension.value.trim() || null,
        password: omicallPassword.value.trim() || undefined,
      });
      omicallPassword.value = '';
    }
    ```
  - Label the section "Omicall extension" with helper text "Extension SIP đã tạo sẵn trên Omicall dashboard".

- [ ] **Step 3: Manual verification** — run `cd frontend && npm run dev`, open Settings > Users, edit a user, confirm the new fields render and the save button calls the endpoint (check Network tab, expect 200).

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npx vue-tsc -b`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/rbac/UserEditPanel.vue frontend/src/composables/use-users.ts frontend/src/stores/rbac.ts
git commit -m "feat(telephony): admin UI to assign Omicall extension per user"
```

---

### Task 9: Frontend softphone composable — `use-omicall-softphone.ts`

**Files:**
- Create: `frontend/src/composables/use-omicall-softphone.ts`
- Delete: `frontend/src/composables/use-stringee-softphone.ts`

**Interfaces:**
- Consumes: `GET /api/v1/telephony/omicall/connect-config` (Task 5), `GET/POST/PATCH /api/v1/telephony/calls` (Task 5)
- Produces: `useOmicallSoftphone()` returning the same shape `TelephonySoftphone.vue` currently destructures from `useStringeeSoftphone()`: `{ phase, errorMessage, peers, history, activePeer, incoming, muted, elapsedSec, enabled, isBusy, fromNumber, initialize, callPeer, callPhone, answer, reject, hangup, toggleMute, resetEnded }`. Keep `fromNumber` as the exposed field name (maps to the new `hotline` API field) so Task 10 barely has to touch the template.

- [ ] **Step 1: Declare global SDK types** — add near the top of the file (there is no `@types` package for Omicall, so hand-roll the minimal surface used):

```ts
declare global {
  interface Window {
    OMICallSDK?: {
      init: (config: Record<string, unknown>) => Promise<boolean>;
      register: (config: { sipRealm: string; sipUser: string; sipPassword: string }) => Promise<{ status: string }>;
      unregister: () => void;
      makeCall: (remoteNumber: string, options?: { isVideo?: boolean }) => void;
      on: (event: string, cb: (data: any) => void) => void;
      off: (event: string, cb: (data: any) => void) => void;
    };
  }
}
```

- [ ] **Step 2: Implement the composable** — port the structure of `use-stringee-softphone.ts` (module-level refs, `loadSdk`, `refreshHistory`, `patchLog`, timer helpers, `finish`, `createLog` stay conceptually the same, calling the same `/telephony/calls` endpoints) with these Omicall-specific changes:
  - `SDK_URL = 'https://cdn.omicrm.com/sdk/web/3.0.41/core.min.js'`
  - `loadSdk()` checks `window.OMICallSDK` instead of `window.StringeeClient`/`StringeeCall`
  - `connect()` calls `GET /telephony/omicall/connect-config` instead of `/telephony/stringee/token`; reads `sipRealm`/`sipUser`/`sipPassword`/`hotline`/`peers` from the response; calls `await window.OMICallSDK.init({})` then `await window.OMICallSDK.register({ sipRealm, sipUser, sipPassword })`
  - Bind SDK events: `OMICallSDK.on('register', (data) => { phase.value = data.status === 'connected' ? 'ready' : data.status === 'connecting' ? 'connecting' : 'error'; })`, `on('ringing', ...)`, `on('accepted', ...)`, `on('ended', ...)` — map to the same `phase`/`patchLog` transitions `bindCallEvents` does today, but reacting to `CallData.state` instead of `signalingstate`.
  - Incoming calls: Omicall SDK doesn't emit a distinct `incomingcall` payload the same shape as Stringee's `StringeeCall` object — instead, `on('ringing', callData)` fires for both directions; disambiguate via `callData.direction === 'inbound'` and `callData.isOutbound === false`. When inbound and no `activeCall` yet, treat it as the incoming-call case (same logic as `handleIncoming` today): resolve `callData.remoteNumber` against `peers` (match by `omicallExtension`) or `normalizeVnPhone`, reject if neither matches, else set `activePeer`/`incoming.value = true`/`createLog(..., 'inbound')`.
  - `answer()` / `reject()` / `hangup()` / `toggleMute()` call `activeCall.accept()` / `activeCall.decline()` / `activeCall.end()` / `activeCall.mute(...)` (the `CallData` control methods) instead of the Stringee `StringeeCall` methods.
  - `startOutgoing()` for both internal and external calls becomes a single path: `window.OMICallSDK.makeCall(remoteNumber, { isVideo: false })` where `remoteNumber` is either the peer's `omicallExtension` or the normalized phone number — no more separate `from`/`to` construction (PBX handles routing).
  - Keep `normalizeVnPhone`, `startTimer`/`stopTimer`, `finish`, `mapSignalState`-equivalent, `createLog`, `refreshHistory`, `patchLog` essentially as-is, adjusted only for the type/event names above.

- [ ] **Step 3: Delete the old composable**

Run: `rm frontend/src/composables/use-stringee-softphone.ts`

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx vue-tsc -b`
Expected: errors remain in `TelephonySoftphone.vue` until Task 10 — fine at this point; no errors inside `use-omicall-softphone.ts` itself.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/use-omicall-softphone.ts
git add frontend/src/composables/use-stringee-softphone.ts
git commit -m "feat(telephony): add Omicall softphone composable, remove Stringee one"
```

---

### Task 10: Frontend component — rebrand `TelephonySoftphone.vue`

**Files:**
- Modify: `frontend/src/components/telephony/TelephonySoftphone.vue`

**Interfaces:**
- Consumes: `useOmicallSoftphone()` (Task 9)

- [ ] **Step 1: Swap the import and composable call**

```ts
import { useOmicallSoftphone, type CallHistoryItem } from '@/composables/use-omicall-softphone';
```
```ts
const {
  phase, errorMessage, peers, history, activePeer, incoming, muted, elapsedSec, enabled, isBusy,
  fromNumber, initialize, callPeer, callPhone, answer, reject, hangup, toggleMute, resetEnded,
} = useOmicallSoftphone();
```

- [ ] **Step 2: Rebrand copy** — `<span class="eyebrow">STRINGEE WEBRTC</span>` → `<span class="eyebrow">OMICALL</span>`; `<audio id="stringee-remote-audio" ...>` → `<audio id="omicall-remote-audio" ...>` (and update the matching `document.getElementById('stringee-remote-audio')` reference inside `use-omicall-softphone.ts` from Task 9 to match — go back and fix that if it was left as the old id).

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npx vue-tsc -b && npm run build`
Expected: no errors.

- [ ] **Step 4: Manual browser check**

Run `cd frontend && npm run dev`, open the app logged in as a user with an Omicall extension assigned, click the phone icon in the header, confirm phase reaches `ready` (or the expected error state if Omicall isn't reachable from dev — report which).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/telephony/TelephonySoftphone.vue
git commit -m "feat(telephony): rebrand softphone UI from Stringee to Omicall"
```

---

### Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Backend typecheck + full test suite**

Run: `cd backend && npx tsc --noEmit && npx vitest run`
Expected: no errors, no failing tests.

- [ ] **Step 2: Frontend typecheck + build**

Run: `cd frontend && npx vue-tsc -b && npm run build`
Expected: no errors.

- [ ] **Step 3: Grep for any remaining Stringee references in the telephony module**

Run: `grep -rn -i stringee backend/src/modules/telephony/ frontend/src/composables/use-omicall-softphone.ts frontend/src/components/telephony/`
Expected: no matches (except possibly a comment noting the migration history, which is fine).

- [ ] **Step 4: Report** — summarize what was built, what still needs a human (Omicall dashboard extension provisioning, webhook URL registration — see the config guide the planner will hand over separately), and any TODOs discovered during implementation.
