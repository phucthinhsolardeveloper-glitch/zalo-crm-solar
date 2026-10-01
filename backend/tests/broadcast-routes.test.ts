/**
 * broadcast-routes.test.ts — Route-level (API) tests for Mục C broadcast routes.
 * Codex audit (2026-10-01) flagged this as missing — processBroadcastTick had
 * worker-level unit tests (broadcast-worker.test.ts) but create/start/schedule
 * had no route-level coverage. Mirrors group-scan-routes.test.ts: builds a
 * Fastify app, registers the route plugin, drives it via inject(); mocks at
 * the prisma + RBAC + queue boundary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser } from './test-helpers.js';

let grantAllowed = true;
const enqueueBroadcastTickMock = vi.fn().mockResolvedValue(undefined);

const prismaMock = {
  automationBroadcast: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
  block: { create: vi.fn() },
  zaloAccount: { findFirst: vi.fn() },
  contact: { findMany: vi.fn() },
  mediaAsset: { findMany: vi.fn() },
  $transaction: vi.fn((arr: Promise<unknown>[]) => Promise.all(arr)),
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser({ orgId: 'org-1' }); },
}));
vi.mock('../src/modules/rbac/rbac-middleware.js', () => ({
  requireGrant: () => async (_req: any, reply: any) => {
    if (!grantAllowed) return reply.status(403).send({ error: 'forbidden' });
  },
}));
vi.mock('../src/modules/broadcast/broadcast-queue.js', () => ({
  enqueueBroadcastTick: (...a: unknown[]) => enqueueBroadcastTickMock(...a),
}));

const { broadcastRoutes } = await import('../src/modules/broadcast/broadcast-routes.js');

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(broadcastRoutes);
  return app;
}

const BASE = '/api/v1/broadcasts';

beforeEach(() => {
  vi.clearAllMocks();
  grantAllowed = true;
  prismaMock.$transaction.mockImplementation((arr: Promise<unknown>[]) => Promise.all(arr));
  prismaMock.zaloAccount.findFirst.mockResolvedValue({ id: 'nick-1', orgId: 'org-1' });
  prismaMock.contact.findMany.mockResolvedValue([{ id: 'c1' }]);
  prismaMock.block.create.mockResolvedValue({ id: 'block-1' });
  prismaMock.automationBroadcast.create.mockResolvedValue({ id: 'bc-1' });
});

// ── POST /broadcasts — create ───────────────────────────────────────────────
describe('POST /api/v1/broadcasts', () => {
  function validBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'Khuyến mãi tháng 10',
      nickId: 'nick-1',
      messageText: 'Xin chào',
      contactIds: ['c1'],
      ...overrides,
    };
  }

  it('403 khi không có quyền broadcast:create (RBAC gate)', async () => {
    grantAllowed = false;
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody() });
    expect(res.statusCode).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('400 khi thiếu tên chiến dịch', async () => {
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody({ name: '' }) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('name_required');
  });

  it('400 khi không có cả messageText lẫn attachment', async () => {
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody({ messageText: '' }) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('message_text_or_attachment_required');
  });

  it('201 khi chỉ có attachment, không có messageText (Phase 3a — chỉ gửi ảnh)', async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([
      { id: 'asset-1', blobs: [{ publicUrl: 'https://cdn/img1.jpg' }] },
    ]);
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: validBody({ messageText: '', attachmentAssetIds: ['asset-1'] }),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().attachmentCount).toBe(1);
  });

  it('400 khi quá 12 ảnh', async () => {
    const ids = Array.from({ length: 13 }, (_, i) => `asset-${i}`);
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody({ attachmentAssetIds: ids }) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('too_many_attachments');
  });

  it('400 khi attachmentAssetIds không khớp ảnh thật nào của org (chặn IDOR/SSRF — không nhận URL từ client)', async () => {
    prismaMock.mediaAsset.findMany.mockResolvedValue([]); // không khớp org/kind='image'
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: validBody({ attachmentAssetIds: ['asset-other-org'] }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('no_valid_attachments');
  });

  it('400 khi contactIds rỗng', async () => {
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody({ contactIds: [] }) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('contact_ids_required');
  });

  it('400 khi nick không thuộc org (hoặc không tồn tại)', async () => {
    prismaMock.zaloAccount.findFirst.mockResolvedValue(null);
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody() });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('nick_not_found');
  });

  it('400 khi không có contact nào hợp lệ trong org (IDOR guard)', async () => {
    prismaMock.contact.findMany.mockResolvedValue([]); // contactIds gửi lên không thuộc org
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody({ contactIds: ['c-other-org'] }) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('no_valid_contacts');
  });

  it('201 khi body hợp lệ — tạo Block + AutomationBroadcast trong 1 transaction', async () => {
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody() });
    expect(res.statusCode).toBe(201);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const body = res.json();
    expect(body.totalRecipients).toBe(1);
    expect(body.attachmentCount).toBe(0);
  });

  it('batchSize/intervalSec ngoài khoảng hợp lệ → 400', async () => {
    const res = await buildApp().inject({ method: 'POST', url: BASE, payload: validBody({ batchSize: 999 }) });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('batch_size_invalid');
  });
});

// ── POST /broadcasts/:id/start — schedule ───────────────────────────────────
describe('POST /api/v1/broadcasts/:id/start', () => {
  it('404 khi không tìm thấy chiến dịch (hoặc khác org)', async () => {
    prismaMock.automationBroadcast.findFirst.mockResolvedValue(null);
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/start` });
    expect(res.statusCode).toBe(404);
  });

  it('409 khi chiến dịch đang running/completed (chỉ start được từ draft/paused)', async () => {
    prismaMock.automationBroadcast.findFirst.mockResolvedValue({ id: 'bc-1', state: 'running', scheduledAt: null });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/start` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('invalid_state');
  });

  it('không có scheduledAt → state=running ngay, enqueue delay=0', async () => {
    prismaMock.automationBroadcast.findFirst.mockResolvedValue({ id: 'bc-1', state: 'draft', scheduledAt: null, startedAt: null });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/start` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ success: true, state: 'running', delayMs: 0 });
    expect(enqueueBroadcastTickMock).toHaveBeenCalledWith('bc-1', 0);
    expect(prismaMock.automationBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'running' }) }),
    );
  });

  // FIX 2026-10-01 verified at route level — trước đây set state='running' ngay
  // cả khi còn phải chờ scheduledAt. Giờ phải là 'scheduled' + enqueue đúng delay.
  it('scheduledAt ở tương lai → state=scheduled (KHÔNG phải running), enqueue đúng delay', async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    prismaMock.automationBroadcast.findFirst.mockResolvedValue({ id: 'bc-1', state: 'draft', scheduledAt: future, startedAt: null });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/start` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.state).toBe('scheduled');
    expect(body.delayMs).toBeGreaterThan(0);
    expect(enqueueBroadcastTickMock).toHaveBeenCalledWith('bc-1', expect.any(Number));
    expect(prismaMock.automationBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: 'scheduled' }) }),
    );
  });

  it('start từ trạng thái paused (resume) cũng hợp lệ', async () => {
    prismaMock.automationBroadcast.findFirst.mockResolvedValue({ id: 'bc-1', state: 'paused', scheduledAt: null, startedAt: new Date() });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/start` });
    expect(res.statusCode).toBe(200);
    expect(res.json().state).toBe('running');
  });
});

// ── pause / cancel ───────────────────────────────────────────────────────────
describe('POST /api/v1/broadcasts/:id/pause và /cancel', () => {
  it('pause: 404 khi không tìm thấy', async () => {
    prismaMock.automationBroadcast.findFirst.mockResolvedValue(null);
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/pause` });
    expect(res.statusCode).toBe(404);
  });

  it('pause: 200 + state=paused', async () => {
    prismaMock.automationBroadcast.findFirst.mockResolvedValue({ id: 'bc-1' });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/pause` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, state: 'paused' });
  });

  it('cancel: 200 + state=cancelled', async () => {
    prismaMock.automationBroadcast.findFirst.mockResolvedValue({ id: 'bc-1' });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/bc-1/cancel` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, state: 'cancelled' });
  });
});

// ── list / get ───────────────────────────────────────────────────────────────
describe('GET /api/v1/broadcasts', () => {
  it('liệt kê theo đúng org của người gọi', async () => {
    prismaMock.automationBroadcast.findMany.mockResolvedValue([{ id: 'bc-1' }]);
    const res = await buildApp().inject({ method: 'GET', url: BASE });
    expect(res.statusCode).toBe(200);
    expect(prismaMock.automationBroadcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org-1' } }),
    );
  });

  it('GET :id trả 404 khi chiến dịch thuộc org khác', async () => {
    prismaMock.automationBroadcast.findFirst.mockResolvedValue(null);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/bc-other-org` });
    expect(res.statusCode).toBe(404);
  });
});
