import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    zaloAccount: { findUnique: vi.fn() },
    conversation: { findMany: vi.fn() },
    message: { findMany: vi.fn() },
  },
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
  handleIncomingMessage: vi.fn(),
}));

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: mocks.prisma }));
vi.mock('../src/shared/tenant/tenant-context.js', () => ({
  runSystemQuery: (callback: () => unknown) => callback(),
  withTenant: (_orgId: string, callback: () => unknown) => callback(),
}));
vi.mock('../src/shared/utils/logger.js', () => ({ logger: mocks.logger }));
vi.mock('../src/modules/chat/message-handler.js', () => ({
  handleIncomingMessage: mocks.handleIncomingMessage,
}));

import {
  extractGroupHistoryMessages,
  isGroupHistoryUnavailableError,
  startMessageSync,
  stopMessageSync,
} from '../src/modules/zalo/zalo-message-sync.js';

describe('group message sync regression', () => {
  const accountId = 'account-sync-test';

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.prisma.zaloAccount.findUnique.mockResolvedValue({ orgId: 'org-sync-test' });
    mocks.prisma.conversation.findMany.mockResolvedValue([
      { id: 'conversation-1', externalThreadId: 'group-1' },
    ]);
    mocks.prisma.message.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    stopMessageSync(accountId);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('only calls group-scoped history and never the global old_messages fallback', async () => {
    const api = {
      getGroupChatHistory: vi.fn().mockRejectedValue(new Error('HTTP 404 Not Found')),
      listener: { requestOldMessages: vi.fn() },
    };

    startMessageSync(api, accountId);
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(api.getGroupChatHistory).toHaveBeenCalledWith('group-1', 50);
    expect(api.listener.requestOldMessages).not.toHaveBeenCalled();

    // A provider 404 disables the backup poll instead of retrying/replaying it
    // every five minutes.
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(api.getGroupChatHistory).toHaveBeenCalledTimes(1);
  });

  it('recognizes provider 404 but not unrelated API failures', () => {
    expect(isGroupHistoryUnavailableError({ code: 404 })).toBe(true);
    expect(isGroupHistoryUnavailableError(new Error('HTTP 404 Not Found'))).toBe(true);
    expect(isGroupHistoryUnavailableError(new Error('network timeout'))).toBe(false);
  });

  it('accepts both SDK history response shapes', () => {
    const message = { data: { msgId: 'msg-1' } };
    expect(extractGroupHistoryMessages({ groupMsgs: [message] })).toEqual([message]);
    expect(extractGroupHistoryMessages({ data: { groupMsgs: [message] } })).toEqual([message]);
    expect(extractGroupHistoryMessages({ data: {} })).toEqual([]);
  });
});
