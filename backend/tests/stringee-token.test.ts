import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createStringeeClientToken, stringeeIdentity } from '../src/modules/telephony/stringee-token.js';

describe('Stringee client token', () => {
  it('creates the required HS256 token without exposing the secret', () => {
    const secret = 'test-secret';
    const { accessToken, expiresAt } = createStringeeClientToken({
      apiKeySid: 'SK_test', apiKeySecret: secret, userId: 'crm_user', iccApi: true, nowSec: 1000,
    });
    const [headerPart, payloadPart, signature] = accessToken.split('.');
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
    expect(header).toEqual({ typ: 'JWT', alg: 'HS256', cty: 'stringee-api;v=1' });
    expect(payload).toMatchObject({ iss: 'SK_test', exp: 4600, userId: 'crm_user', icc_api: true });
    expect(expiresAt).toBe(4600);
    expect(signature).toBe(createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest('base64url'));
    expect(accessToken).not.toContain(secret);
  });

  it('maps CRM UUIDs to stable Stringee identities', () => {
    expect(stringeeIdentity('abc-123-DEF')).toBe('crm_abc123DEF');
    expect(stringeeIdentity('899818a4-7a24-4d84-a30f-3637e4ad53a4')).toBe('crm_899818a47a244d84a30f3637e4ad');
    expect(stringeeIdentity('899818a4-7a24-4d84-a30f-3637e4ad53a4')).toHaveLength(32);
  });
});
