import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEncryptionKey = process.env.ENCRYPTION_KEY;
const originalSessionKey = process.env.ZALO_SESSION_ENCRYPTION_KEY;
const originalPreviousKey = process.env.ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS;

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = originalEncryptionKey;
  if (originalSessionKey === undefined) delete process.env.ZALO_SESSION_ENCRYPTION_KEY;
  else process.env.ZALO_SESSION_ENCRYPTION_KEY = originalSessionKey;
  if (originalPreviousKey === undefined) delete process.env.ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS;
  else process.env.ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS = originalPreviousKey;
  vi.resetModules();
});

describe('zalo session key rollover', () => {
  it('decrypts old envelopes during the rollover window and re-encrypts with the new key', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ZALO_SESSION_ENCRYPTION_KEY = 'a'.repeat(64);
    delete process.env.ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS;
    vi.resetModules();
    const oldCrypto = await import('../src/modules/zalo/zalo-session-crypto.js');
    const credentials = { cookie: { sid: 'old' }, imei: 'old-imei', userAgent: 'ua' };
    const oldEnvelope = oldCrypto.encryptZaloSession(credentials);

    process.env.ZALO_SESSION_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS = 'a'.repeat(64);
    vi.resetModules();
    const rotatedCrypto = await import('../src/modules/zalo/zalo-session-crypto.js');

    expect(rotatedCrypto.decryptZaloSession(oldEnvelope)).toEqual(credentials);
    expect(rotatedCrypto.isZaloSessionUsingCurrentKey(oldEnvelope)).toBe(false);
    const newEnvelope = rotatedCrypto.reencryptZaloSession(oldEnvelope);
    expect(rotatedCrypto.isZaloSessionUsingCurrentKey(newEnvelope)).toBe(true);
    expect(rotatedCrypto.decryptZaloSession(newEnvelope)).toEqual(credentials);
  });
});
