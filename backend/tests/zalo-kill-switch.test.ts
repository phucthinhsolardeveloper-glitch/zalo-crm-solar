import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = {
  zaloAccount: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: prismaMock,
}));

async function loadKillSwitch() {
  vi.resetModules();
  return import('../src/modules/zalo/zalo-kill-switch.js');
}

beforeEach(() => {
  prismaMock.zaloAccount.findUnique.mockReset();
  prismaMock.zaloAccount.update.mockReset();
});

afterEach(() => {
  vi.resetModules();
});

describe('zalo-kill-switch', () => {
  it('reports not-paused when sendingPausedAt is null', async () => {
    const { isSendingPaused } = await loadKillSwitch();
    prismaMock.zaloAccount.findUnique.mockResolvedValue({ sendingPausedAt: null, sendingPausedReason: null });

    const state = await isSendingPaused('acc-1');

    expect(state.paused).toBe(false);
  });

  it('reports paused with reason when sendingPausedAt is set', async () => {
    const { isSendingPaused } = await loadKillSwitch();
    prismaMock.zaloAccount.findUnique.mockResolvedValue({
      sendingPausedAt: new Date(),
      sendingPausedReason: 'Nghi ngờ bị Zalo đánh dấu spam',
    });

    const state = await isSendingPaused('acc-2');

    expect(state.paused).toBe(true);
    expect(state.reason).toBe('Nghi ngờ bị Zalo đánh dấu spam');
  });

  it('caches the result briefly so a burst of sends does not hammer the DB', async () => {
    const { isSendingPaused } = await loadKillSwitch();
    prismaMock.zaloAccount.findUnique.mockResolvedValue({ sendingPausedAt: null, sendingPausedReason: null });

    await isSendingPaused('acc-3');
    await isSendingPaused('acc-3');
    await isSendingPaused('acc-3');

    expect(prismaMock.zaloAccount.findUnique).toHaveBeenCalledTimes(1);
  });

  it('pauseSending writes the pause fields and invalidates the cache immediately', async () => {
    const { pauseSending, isSendingPaused } = await loadKillSwitch();
    prismaMock.zaloAccount.findUnique
      .mockResolvedValueOnce({ sendingPausedAt: null, sendingPausedReason: null })
      .mockResolvedValueOnce({ sendingPausedAt: new Date(), sendingPausedReason: 'test' });
    prismaMock.zaloAccount.update.mockResolvedValue({});

    expect((await isSendingPaused('acc-4')).paused).toBe(false);
    await pauseSending('acc-4', 'test', 'user-1');
    expect((await isSendingPaused('acc-4')).paused).toBe(true);

    expect(prismaMock.zaloAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-4' },
      data: expect.objectContaining({
        sendingPausedReason: 'test',
        sendingPausedById: 'user-1',
      }),
    });
  });

  it('resumeSending clears the pause fields and invalidates the cache', async () => {
    const { resumeSending, isSendingPaused } = await loadKillSwitch();
    prismaMock.zaloAccount.findUnique
      .mockResolvedValueOnce({ sendingPausedAt: new Date(), sendingPausedReason: 'test' })
      .mockResolvedValueOnce({ sendingPausedAt: null, sendingPausedReason: null });
    prismaMock.zaloAccount.update.mockResolvedValue({});

    expect((await isSendingPaused('acc-5')).paused).toBe(true);
    await resumeSending('acc-5');
    expect((await isSendingPaused('acc-5')).paused).toBe(false);

    expect(prismaMock.zaloAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-5' },
      data: { sendingPausedAt: null, sendingPausedReason: null, sendingPausedById: null },
    });
  });
});
