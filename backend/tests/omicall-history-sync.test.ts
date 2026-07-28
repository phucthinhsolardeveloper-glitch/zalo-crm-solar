// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/index.js', () => ({
  config: {
    omicallApiKey: 'api-key',
    omicallApiBaseUrl: 'https://public-v1-stg.omicall.com',
  },
}));
vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    contact: { findFirst: vi.fn() },
    telephonyCall: { findFirst: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock('../src/modules/telephony/omicall-recording.js', () => ({
  persistOmicallRecording: vi.fn(async (item: Record<string, unknown>) =>
    String(item.recording_file || item.recording_file_url || '').trim() || null),
}));

import { prisma } from '../src/shared/database/prisma-client.js';
import { syncOmicallHistoryForUser } from '../src/modules/telephony/omicall-history-sync.js';

describe('syncOmicallHistoryForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('imports an answered call and prefers the concrete recording_file URL', async () => {
    (fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        status_code: 9999,
        payload: {
          items: [{
            transaction_id: 'tx-history-1',
            direction: 'outbound',
            sip_user: '101',
            phone_number: '0909123456',
            disposition: 'answered',
            bill_sec: 37,
            time_start_call: 1_758_000_000,
            time_start_to_answer: 1_758_000_005,
            time_end_call: 1_758_000_042,
            recording_file: 'https://public-v1.omicrm.com/history-1.mp3',
            recording_file_url: 'https://public-v1.omicrm.com/history-1',
          }],
        },
      }),
    });
    (prisma.contact.findFirst as any).mockResolvedValue({ id: 'contact-1' });
    (prisma.telephonyCall.findFirst as any).mockResolvedValue(null);
    (prisma.telephonyCall.upsert as any).mockResolvedValue({ id: 'call-1' });

    const result = await syncOmicallHistoryForUser({
      userId: 'user-1',
      orgId: 'org-1',
      extension: '101',
      days: 30,
    });

    expect(result).toEqual({ synced: 1, total: 1, pages: 1 });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v3/call-transaction/search?page=1&size=50'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'api-key' }),
      }),
    );
    expect(prisma.telephonyCall.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          providerCallId: 'tx-history-1',
          status: 'completed',
          durationSec: 37,
          recordingId: 'https://public-v1.omicrm.com/history-1.mp3',
        }),
      }),
    );
  });

  it('continues syncing until Omicall returns a partial page', async () => {
    const fullPage = Array.from({ length: 50 }, (_, index) => ({
      transaction_id: `ignored-${index}`,
      direction: 'unsupported',
    }));
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status_code: 9999, payload: { items: fullPage } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status_code: 9999,
          payload: {
            items: [{
              transaction_id: 'tx-page-2',
              direction: 'inbound',
              phone_number: '0909123456',
              disposition: 'answered',
              bill_sec: 8,
            }],
          },
        }),
      });
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.telephonyCall.findFirst as any).mockResolvedValue(null);
    (prisma.telephonyCall.upsert as any).mockResolvedValue({ id: 'call-page-2' });

    const result = await syncOmicallHistoryForUser({
      userId: 'user-1',
      orgId: 'org-1',
      extension: '101',
    });

    expect(result).toEqual({ synced: 1, total: 51, pages: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/v3/call-transaction/search?page=2&size=50'),
      expect.any(Object),
    );
  });
});
