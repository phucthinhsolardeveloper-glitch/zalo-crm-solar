import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMocks = vi.hoisted(() => ({ info: vi.fn() }));

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: { contact: { updateMany: vi.fn() } },
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: loggerMocks.info },
}));

import { detectContentType } from '../src/modules/zalo/zalo-message-helpers.js';

describe('detectContentType', () => {
  beforeEach(() => loggerMocks.info.mockClear());

  it('treats webchat as a known text message without unknown-type noise', () => {
    expect(detectContentType('webchat', 'DẠ')).toBe('text');
    expect(loggerMocks.info).not.toHaveBeenCalled();
  });
});
