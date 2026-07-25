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

import { prisma } from '../src/shared/database/prisma-client.js';
import { syncOmicallHistoryForUser } from '../src/modules/telephony/omicall-history-sync.js';

describe('syncOmicallHistoryForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('imports an answered call and its recording URL', async () => {
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
            recording_file_url: 'https://public-v1.omicrm.com/history-1.mp3',
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

    expect(result).toEqual({ synced: 1, total: 1 });
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
});
