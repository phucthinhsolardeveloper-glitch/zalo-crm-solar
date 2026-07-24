// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHmac, randomUUID } from 'node:crypto';

export function stringeeIdentity(userId: string): string {
  return `crm_${userId.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function createStringeeClientToken(input: {
  apiKeySid: string;
  apiKeySecret: string;
  userId: string;
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
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createHmac('sha256', input.apiKeySecret).update(unsigned).digest('base64url');
  return { accessToken: `${unsigned}.${signature}`, expiresAt };
}
