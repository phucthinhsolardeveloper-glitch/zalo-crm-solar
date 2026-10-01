import {
  decryptZaloSession,
  encryptZaloSession,
  isEncryptedZaloSession,
  isLegacyZaloSession,
} from '../src/modules/zalo/zalo-session-crypto.js';

const credentials = {
  cookie: { zpw_sek: 'secret-cookie', zlogin: 'session-cookie' },
  imei: 'imei-test-1',
  userAgent: 'Mozilla/5.0 test',
};

describe('zalo session crypto', () => {
  it('encrypts and decrypts credentials without keeping raw fields in the envelope', () => {
    const envelope = encryptZaloSession(credentials);

    expect(isEncryptedZaloSession(envelope)).toBe(true);
    expect(JSON.stringify(envelope)).not.toContain('secret-cookie');
    expect(JSON.stringify(envelope)).not.toContain('imei-test-1');
    expect(decryptZaloSession(envelope)).toEqual(credentials);
  });

  it('reads legacy plaintext once so existing sessions can be migrated', () => {
    expect(isLegacyZaloSession(credentials)).toBe(true);
    expect(decryptZaloSession(credentials)).toEqual(credentials);
  });

  it('rejects tampered encrypted sessions', () => {
    const envelope = encryptZaloSession(credentials);
    const tampered = `${envelope.data.slice(0, -1)}${envelope.data.endsWith('A') ? 'B' : 'A'}`;
    expect(() => decryptZaloSession({ ...envelope, data: tampered })).toThrow();
  });
});
