import { afterEach, describe, expect, it, vi } from 'vitest';

const limit = { daily: 100, burst: 2, burstWindowMs: 60_000 };

async function loadLimiter(args: {
  configured: boolean;
  redis: unknown;
}) {
  vi.resetModules();
  vi.stubEnv('REDIS_URL', args.configured ? 'redis://test:6379' : '');
  vi.doMock('../src/shared/redis-client.js', () => ({
    getRedis: vi.fn().mockResolvedValue(args.redis),
    isRedisConfigured: () => args.configured,
  }));
  vi.doMock('../src/modules/zalo/sdk-limit-service.js', () => ({
    getEffectiveLimit: vi.fn().mockResolvedValue(limit),
    ALL_CATEGORIES: ['message'],
    DEFAULT_SDK_LIMITS: { message: limit },
  }));
  return import('../src/modules/zalo/zalo-rate-limiter.js');
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doUnmock('../src/shared/redis-client.js');
  vi.doUnmock('../src/modules/zalo/sdk-limit-service.js');
});

describe('ZaloRateLimiter outbound reservation', () => {
  it('reserves in-memory quota immediately and blocks the third burst', async () => {
    const { ZaloRateLimiter } = await loadLimiter({ configured: false, redis: null });
    const limiter = new ZaloRateLimiter();

    expect((await limiter.reserve('account-1')).allowed).toBe(true);
    expect((await limiter.reserve('account-1')).allowed).toBe(true);
    const blocked = await limiter.reserve('account-1');

    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('Quá nhanh');
  });

  it('keeps ordinary messaging available when Redis is configured but unavailable', async () => {
    const { ZaloRateLimiter } = await loadLimiter({ configured: true, redis: null });
    const limiter = new ZaloRateLimiter();

    const result = await limiter.reserve('account-1');

    expect(result.allowed).toBe(true);
    expect(result.reservationId).toBeTruthy();
  });

  it('releases a failed in-memory reservation so the next send can use quota', async () => {
    const { ZaloRateLimiter } = await loadLimiter({ configured: false, redis: null });
    const limiter = new ZaloRateLimiter();

    const first = await limiter.reserve('account-1');
    await limiter.release('account-1', 'message', first.reservationId);
    expect((await limiter.reserve('account-1')).allowed).toBe(true);
  });

  it('uses the atomic Redis reservation result', async () => {
    const evalMock = vi.fn().mockResolvedValue([0, 2]);
    const { ZaloRateLimiter } = await loadLimiter({
      configured: true,
      redis: { eval: evalMock },
    });
    const limiter = new ZaloRateLimiter();

    const result = await limiter.reserve('account-1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Quá nhanh');
    expect(evalMock).toHaveBeenCalledOnce();
    expect(evalMock.mock.calls[0][1]).toBe(2);
  });
});
