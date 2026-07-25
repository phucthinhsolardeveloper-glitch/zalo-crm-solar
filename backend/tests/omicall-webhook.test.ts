// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    telephonyCall: { updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    user: { findMany: vi.fn() },
    contact: { findFirst: vi.fn() },
  },
}));
vi.mock('../src/config/index.js', () => ({
  config: { omicallWebhookSecret: 'test-secret', omicallEnabled: true, omicallDomain: 'demo01', omicallHotline: '' },
}));

import Fastify from 'fastify';
import { prisma } from '../src/shared/database/prisma-client.js';
import { omicallPublicRoutes } from '../src/modules/telephony/omicall-public-routes.js';

describe('POST /api/v1/telephony/omicall/events', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects requests with a missing/wrong webhook key', async () => {
    const app = Fastify();
    await app.register(omicallPublicRoutes);
    const res = await app.inject({ method: 'POST', url: '/api/v1/telephony/omicall/events', payload: { state: 'ringing' } });
    expect(res.statusCode).toBe(403);
  });

  it('accepts a correctly-keyed event and updates matching call rows by transaction_id', async () => {
    (prisma.telephonyCall.updateMany as any).mockResolvedValue({ count: 1 });
    const app = Fastify();
    await app.register(omicallPublicRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telephony/omicall/events?key=test-secret',
      payload: { state: 'answered', transaction_id: 'tx-1', extension: '101' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.telephonyCall.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerCallId: 'tx-1' } }),
    );
  });
});
