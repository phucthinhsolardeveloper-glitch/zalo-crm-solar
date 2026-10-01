/**
 * broadcast-worker.test.ts — Mục C: cổng an toàn bắt buộc của processBroadcastTick.
 * Mocks prisma + zaloOps + zaloPool (mirrors group-scan-worker.test.ts pattern).
 *
 * Asserts:
 *   - skip contact chưa kết bạn với đúng nick (H-2) — không gửi, không lỗi.
 *   - skip contact đã revoke consent.
 *   - hết quota (RATE_LIMITED) → state='paused', KHÔNG tăng failedCount.
 *   - kill switch (SENDING_PAUSED) → state='paused'.
 *   - resume đúng từ resumeCursor (không gửi lại contact đã xử lý).
 *   - hoàn tất hết segment → state='completed'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendCampaignMessageMock = vi.fn();

class FakeZaloOpError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: { sendCampaignMessage: sendCampaignMessageMock },
  ZaloOpError: FakeZaloOpError,
}));

const getStatusMock = vi.fn().mockReturnValue('connected');
vi.mock('../src/modules/zalo/zalo-pool.js', () => ({
  zaloPool: { getStatus: getStatusMock },
}));

// resolveBlockContent thật (Community, đăng ký ở app.ts boot) không chạy trong
// unit test — mock tối giản khớp BLOCK fixture bên dưới (1 phần text).
vi.mock('../src/shared/ee-registry/automation.js', () => ({
  resolveBlockContent: (_actionType: string, content: Record<string, unknown>) => {
    const text = typeof content?.text === 'string' ? content.text : '';
    return text
      ? { ok: true, resolved: [{ messageType: 'text', payload: { text, styles: null } }] }
      : { ok: false, error: 'BLOCK_EMPTY', resolved: [] };
  },
}));

const prismaMock = {
  automationBroadcast: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  },
  block: { findUnique: vi.fn() },
  contact: { findUnique: vi.fn() },
  friend: { findFirst: vi.fn() },
};
vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { processBroadcastTick } = await import('../src/modules/broadcast/broadcast-worker.js');

const BLOCK = {
  id: 'block-1', ownerNickId: 'nick-1', content: { text: 'Xin chào KH' },
};

function baseBroadcast(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'bc-1',
    state: 'running',
    blockId: 'block-1',
    resumeCursor: null,
    segmentSpec: { contactIds: ['c1', 'c2'] },
    workerStats: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getStatusMock.mockReturnValue('connected');
  prismaMock.block.findUnique.mockResolvedValue(BLOCK);
  prismaMock.automationBroadcast.updateMany.mockResolvedValue({ count: 1 });
});

function lastBroadcastUpdateData(): any {
  const updateManyCall = prismaMock.automationBroadcast.updateMany.mock.calls.at(-1)?.[0];
  if (updateManyCall) return updateManyCall.data;
  return prismaMock.automationBroadcast.update.mock.calls.at(-1)?.[0]?.data;
}

describe('processBroadcastTick — cổng an toàn', () => {
  it('skip contact chưa kết bạn với nick này (H-2) — không gửi', async () => {
    prismaMock.automationBroadcast.findUnique.mockResolvedValue(baseBroadcast());
    prismaMock.contact.findUnique.mockResolvedValue({ id: 'c1', consentStatus: 'implicit' });
    prismaMock.friend.findFirst.mockResolvedValue(null); // chưa kết bạn

    const result = await processBroadcastTick('bc-1');

    expect(sendCampaignMessageMock).not.toHaveBeenCalled();
    expect(result.state).toBe('completed'); // hết 2 contact (đều skip) → completed
    const updateData = lastBroadcastUpdateData();
    expect(updateData.workerStats.skipped.some((s: any) => s.reason === 'not_friend_or_stranger_chat')).toBe(true);
  });

  it('CHO PHÉP gửi contact chatting_stranger (đã từng nhắn qua, chưa kết bạn — quyết định user 2026-09-30)', async () => {
    prismaMock.automationBroadcast.findUnique.mockResolvedValue(baseBroadcast({ segmentSpec: { contactIds: ['c1'] } }));
    prismaMock.contact.findUnique.mockResolvedValue({ id: 'c1', consentStatus: 'implicit' });
    // Mock chỉ trả kết quả nếu where thật sự chứa OR chatting_stranger — verify
    // truy vấn đúng, không chỉ verify hành vi cuối.
    prismaMock.friend.findFirst.mockImplementation(async ({ where }: any) => {
      const matchesStranger = where.OR?.some((c: any) => c.relationshipKind === 'chatting_stranger');
      return matchesStranger ? { zaloUidInNick: 'uid-stranger-1' } : null;
    });
    sendCampaignMessageMock.mockResolvedValue({ success: true });

    const result = await processBroadcastTick('bc-1');

    expect(sendCampaignMessageMock).toHaveBeenCalledWith('nick-1', 'uid-stranger-1', 0, { msg: 'Xin chào KH' });
    expect(result.state).toBe('completed');
  });

  it('skip contact đã revoke consent — không gửi', async () => {
    prismaMock.automationBroadcast.findUnique.mockResolvedValue(baseBroadcast({ segmentSpec: { contactIds: ['c1'] } }));
    prismaMock.contact.findUnique.mockResolvedValue({ id: 'c1', consentStatus: 'revoked' });

    await processBroadcastTick('bc-1');

    expect(sendCampaignMessageMock).not.toHaveBeenCalled();
    expect(prismaMock.friend.findFirst).not.toHaveBeenCalled();
  });

  it('hết quota (RATE_LIMITED) → pause, KHÔNG tăng failedCount', async () => {
    prismaMock.automationBroadcast.findUnique.mockResolvedValue(baseBroadcast({ segmentSpec: { contactIds: ['c1', 'c2'] } }));
    prismaMock.contact.findUnique.mockResolvedValue({ id: 'c1', consentStatus: 'implicit' });
    prismaMock.friend.findFirst.mockResolvedValue({ zaloUidInNick: 'uid-1' });
    sendCampaignMessageMock.mockRejectedValue(new FakeZaloOpError('rate limited', 'RATE_LIMITED'));

    const result = await processBroadcastTick('bc-1');

    expect(result.state).toBe('paused');
    const updateData = lastBroadcastUpdateData();
    expect(updateData.state).toBe('paused');
    // failedCount không được tăng lên — hết quota là "tạm dừng", không phải "gửi lỗi".
    expect(updateData.failedCount?.increment ?? 0).toBe(0);
    expect(updateData.workerStats.lastError).toBe('quota_exhausted');
  });

  it('kill switch đang bật (SENDING_PAUSED) → pause broadcast', async () => {
    prismaMock.automationBroadcast.findUnique.mockResolvedValue(baseBroadcast());
    prismaMock.contact.findUnique.mockResolvedValue({ id: 'c1', consentStatus: 'implicit' });
    prismaMock.friend.findFirst.mockResolvedValue({ zaloUidInNick: 'uid-1' });
    sendCampaignMessageMock.mockRejectedValue(new FakeZaloOpError('paused', 'SENDING_PAUSED'));

    const result = await processBroadcastTick('bc-1');

    expect(result.state).toBe('paused');
    const updateData = lastBroadcastUpdateData();
    expect(updateData.workerStats.lastError).toBe('kill_switch_active');
  });

  it('resume đúng từ resumeCursor — không gửi lại contact đã xử lý', async () => {
    prismaMock.automationBroadcast.findUnique.mockResolvedValue(
      baseBroadcast({ segmentSpec: { contactIds: ['c1', 'c2'] }, resumeCursor: 'c1' }),
    );
    prismaMock.contact.findUnique.mockResolvedValue({ id: 'c2', consentStatus: 'implicit' });
    prismaMock.friend.findFirst.mockResolvedValue({ zaloUidInNick: 'uid-2' });
    sendCampaignMessageMock.mockResolvedValue({ success: true });

    await processBroadcastTick('bc-1');

    expect(prismaMock.contact.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.contact.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c2' } }));
  });

  it('gửi thành công hết segment → state=completed, sentCount tăng đúng', async () => {
    prismaMock.automationBroadcast.findUnique.mockResolvedValue(baseBroadcast({ segmentSpec: { contactIds: ['c1'] } }));
    prismaMock.contact.findUnique.mockResolvedValue({ id: 'c1', consentStatus: 'implicit' });
    prismaMock.friend.findFirst.mockResolvedValue({ zaloUidInNick: 'uid-1' });
    sendCampaignMessageMock.mockResolvedValue({ success: true });

    const result = await processBroadcastTick('bc-1');

    expect(result.state).toBe('completed');
    const updateData = lastBroadcastUpdateData();
    expect(updateData.sentCount).toEqual({ increment: 1 });
    expect(sendCampaignMessageMock).toHaveBeenCalledWith('nick-1', 'uid-1', 0, { msg: 'Xin chào KH' });
  });

  it('nick không connected → pause ngay, không gửi', async () => {
    getStatusMock.mockReturnValue('disconnected');
    prismaMock.automationBroadcast.findUnique.mockResolvedValue(baseBroadcast());

    const result = await processBroadcastTick('bc-1');

    expect(result.state).toBe('paused');
    expect(sendCampaignMessageMock).not.toHaveBeenCalled();
  });

  it('không ghi đè pause/cancel đến trong lúc chunk đang gửi', async () => {
    const running = baseBroadcast({ segmentSpec: { contactIds: ['c1'] } });
    prismaMock.automationBroadcast.findUnique
      .mockResolvedValueOnce(running)
      .mockResolvedValueOnce({ state: 'cancelled' });
    prismaMock.contact.findUnique.mockResolvedValue({ id: 'c1', consentStatus: 'implicit' });
    prismaMock.friend.findFirst.mockResolvedValue({ zaloUidInNick: 'uid-1' });
    sendCampaignMessageMock.mockResolvedValue({ success: true });
    prismaMock.automationBroadcast.updateMany.mockResolvedValue({ count: 0 });

    const result = await processBroadcastTick('bc-1');

    expect(result.state).toBe('paused');
    expect(prismaMock.automationBroadcast.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bc-1' }, data: expect.not.objectContaining({ state: expect.anything() }) }),
    );
    expect(prismaMock.automationBroadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bc-1', state: 'running' } }),
    );
  });
});
