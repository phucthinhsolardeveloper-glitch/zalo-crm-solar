// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac, randomUUID } from 'node:crypto';

export function stringeeIdentity(userId: string): string {
  // PCC Agent stringee_user_id is limited to 32 characters. UUIDs without
  // hyphens are 32 chars, so keep a 4-char namespace plus 28 UUID chars.
  // 112 bits of UUID entropy remain, which is ample for collision safety.
  return `crm_${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 28)}`;
}

export function createStringeeClientToken(input: {
  apiKeySid: string;
  apiKeySecret: string;
  userId: string;
  iccApi?: boolean;
  expiresInSec?: number;
  nowSec?: number;
}): { accessToken: string; expiresAt: number } {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const expiresAt = now + (input.expiresInSec ?? 3600);
  const header = { typ: 'JWT', alg: 'HS256', cty: 'stringee-api;v=1' };
  const payload = {
    jti: `${input.apiKeySid}-${randomUUID()}`,
    iss: input.apiKeySid,
    exp: expiresAt,
    userId: input.userId,
    ...(input.iccApi ? { icc_api: true } : {}),
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', input.apiKeySecret).update(unsigned).digest('base64url');
  return { accessToken: `${unsigned}.${signature}`, expiresAt };
}
