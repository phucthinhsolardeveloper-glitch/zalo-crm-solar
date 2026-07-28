// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    telephonyCall: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    user: { findMany: vi.fn(), findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
  },
}));
vi.mock('../src/config/index.js', () => ({
  config: { omicallWebhookSecret: 'test-secret', omicallEnabled: true, omicallDomain: 'demo01', omicallHotline: '' },
}));
vi.mock('../src/modules/telephony/omicall-recording.js', () => ({
  persistOmicallRecording: vi.fn(async (body: Record<string, unknown>) =>
    String(body.recording_file || body.recording_file_url || '').trim() || null),
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

  it('accepts the webhook secret through the x-webhook-key header', async () => {
    (prisma.telephonyCall.updateMany as any).mockResolvedValue({ count: 1 });
    const app = Fastify();
    await app.register(omicallPublicRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telephony/omicall/events',
      headers: { 'x-webhook-key': 'test-secret' },
      payload: { state: 'answered', transaction_id: 'tx-header-1', extension: '101' },
    });
    expect(res.statusCode).toBe(200);
    expect(prisma.telephonyCall.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerCallId: 'tx-header-1' } }),
    );
  });

  it('creates an inbound call from a final CDR and saves its recording URL', async () => {
    (prisma.telephonyCall.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.telephonyCall.findFirst as any).mockResolvedValue(null);
    (prisma.user.findFirst as any).mockResolvedValue({ id: 'user-1', orgId: 'org-1' });
    (prisma.contact.findFirst as any).mockResolvedValue({ id: 'contact-1' });
    (prisma.telephonyCall.create as any).mockResolvedValue({ id: 'call-1' });

    const app = Fastify();
    await app.register(omicallPublicRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telephony/omicall/events?key=test-secret',
      payload: {
        state: 'cdr',
        transaction_id: 'tx-cdr-1',
        direction: 'inbound',
        sip_user: '101',
        phone_number: '0909123456',
        bill_sec: 41,
        answer_sec: 39,
        time_start_to_answer: 1_758_000_010,
        time_end_call: 1_758_000_051,
        recording_file_url: 'https://public-v1.omicrm.com/recording.mp3',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ omicallExtension: '101' }) }),
    );
    expect(prisma.telephonyCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerCallId: 'tx-cdr-1',
        status: 'completed',
        durationSec: 41,
        recordingId: 'https://public-v1.omicrm.com/recording.mp3',
      }),
    });
  });

  it('merges a final CDR into the pending browser-created call', async () => {
    (prisma.telephonyCall.updateMany as any).mockResolvedValue({ count: 0 });
    (prisma.user.findFirst as any).mockResolvedValue({ id: 'user-1', orgId: 'org-1' });
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.telephonyCall.findFirst as any).mockResolvedValue({ id: 'pending-call' });
    (prisma.telephonyCall.update as any).mockResolvedValue({ id: 'pending-call' });

    const app = Fastify();
    await app.register(omicallPublicRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/telephony/omicall/events?key=test-secret',
      payload: {
        state: 'cdr',
        transaction_id: 'tx-cdr-2',
        direction: 'outbound',
        sip_user: '101',
        to_number: '0909123456',
        time_start_call: 1_758_000_000,
        bill_sec: 12,
        recording_file_url: 'https://public-v1.omicrm.com/recording-2.mp3',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.telephonyCall.update).toHaveBeenCalledWith({
      where: { id: 'pending-call' },
      data: expect.objectContaining({
        providerCallId: 'tx-cdr-2',
        status: 'completed',
        durationSec: 12,
        recordingId: 'https://public-v1.omicrm.com/recording-2.mp3',
      }),
    });
    expect(prisma.telephonyCall.create).not.toHaveBeenCalled();
  });
});
