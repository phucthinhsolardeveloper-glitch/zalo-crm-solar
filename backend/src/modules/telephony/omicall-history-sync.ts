// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { persistOmicallRecording } from './omicall-recording.js';

type OmicallHistoryItem = Record<string, any>;

function providerDate(value: unknown): Date | undefined {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
  return new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000);
}

function callStatus(item: OmicallHistoryItem, direction: 'inbound' | 'outbound'): string {
  const disposition = String(item.disposition || '').toLowerCase();
  const answered = disposition === 'answered'
    || Number(item.bill_sec ?? 0) > 0
    || Number(item.answer_sec ?? 0) > 0;
  if (answered) return 'completed';
  return direction === 'inbound' ? 'missed' : 'rejected';
}

export async function syncOmicallHistoryForUser(args: {
  userId: string;
  orgId: string;
  extension: string;
  days?: number;
}): Promise<{ synced: number; total: number; pages: number }> {
  if (!config.omicallApiKey) throw new Error('OMICALL_API_KEY chưa được cấu hình');

  const days = Math.min(Math.max(args.days || 30, 1), 90);
  const toDate = Date.now();
  const fromDate = toDate - days * 24 * 60 * 60 * 1000;
  let synced = 0;
  let total = 0;
  let pages = 0;
  let page = 1;
  const pageSize = 50;
  let previousPageSignature = '';

  while (true) {
    const endpoint = `${config.omicallApiBaseUrl}/api/v3/call-transaction/search?page=${page}&size=${pageSize}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.omicallApiKey,
      },
      body: JSON.stringify({
        filter: {
          fromDate,
          toDate,
          sipUsers: [args.extension],
        },
        sort: { field: 'created_date', isAsc: false },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Omicall history API trả HTTP ${response.status}`);
    }
    const json = await response.json() as Record<string, any>;
    if (json.status_code != null && Number(json.status_code) !== 9999) {
      throw new Error(String(json.message || 'API tổng đài từ chối yêu cầu'));
    }
    const payload = json.payload ?? json;
    const items: OmicallHistoryItem[] = Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload) ? payload : [];
    pages += 1;
    total += items.length;

    // Prevent an infinite loop if a provider deployment ignores the page
    // parameter and keeps returning the same full page.
    const pageSignature = items
      .map((item) => String(item.transaction_id || item.call_uuid || ''))
      .filter(Boolean)
      .join('|');
    if (page > 1 && pageSignature && pageSignature === previousPageSignature) {
      total -= items.length;
      break;
    }
    previousPageSignature = pageSignature;

    for (const item of items) {
      const transactionId = String(item.transaction_id || item.call_uuid || '').trim();
      const rawDirection = String(item.direction || '').toLowerCase();
      if (!transactionId || !['inbound', 'outbound'].includes(rawDirection)) continue;
      const direction = rawDirection as 'inbound' | 'outbound';
      const rawPhone = item.phone_number
        || (direction === 'outbound' ? item.destination_number || item.to_number : item.source_number || item.from_number);
      const phoneNumber = normalizePhone(String(rawPhone || ''));
      if (!phoneNumber) continue;

      const startedAt = providerDate(item.time_start_call || item.created_date) || new Date();
      const answeredAt = providerDate(item.time_start_to_answer);
      const endedAt = providerDate(item.time_end_call);
      const durationSec = Number(item.bill_sec ?? 0);
      const status = callStatus(item, direction);
      const recordingId = await persistOmicallRecording(item);
      const providerSipNumber = String(item.sip_number || item.hotline || '').trim();
      const channel = config.omicallZccEnabled
        && Boolean(config.omicallZccSipNumber)
        && providerSipNumber === config.omicallZccSipNumber
        ? 'zcc'
        : 'pstn';
      const variants = phoneVariants(phoneNumber);
      const contact = await prisma.contact.findFirst({
        where: {
          orgId: args.orgId,
          mergedInto: null,
          OR: [
            { phoneNormalized: phoneNumber },
            { phone: { in: variants } },
            { phone2: { in: variants } },
            { phone3: { in: variants } },
          ],
        },
        select: { id: true },
      });
      const data = {
        contactId: contact?.id || null,
        externalNumber: phoneNumber,
        externalIdentity: phoneNumber,
        externalIdentityType: 'phone',
        channel,
        status,
        startedAt,
        answeredAt: answeredAt || (status === 'completed' ? startedAt : null),
        endedAt: endedAt || startedAt,
        durationSec: Number.isFinite(durationSec) ? Math.max(0, Math.round(durationSec)) : 0,
        endReason: String(item.hangup_cause || item.invite_failure_status || '').slice(0, 255) || null,
        recordingId,
      };

      const pending = await prisma.telephonyCall.findFirst({
        where: {
          orgId: args.orgId,
          ownerUserId: args.userId,
          provider: 'omicall',
          providerCallId: null,
          direction,
          externalNumber: phoneNumber,
          startedAt: {
            gte: new Date(startedAt.getTime() - 2 * 60_000),
            lte: new Date(startedAt.getTime() + 2 * 60_000),
          },
        },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
      if (pending) {
        await prisma.telephonyCall.update({
          where: { id: pending.id },
          data: { providerCallId: transactionId, ...data },
        });
      } else {
        await prisma.telephonyCall.upsert({
          where: {
            ownerUserId_providerCallId: {
              ownerUserId: args.userId,
              providerCallId: transactionId,
            },
          },
          update: data,
          create: {
            orgId: args.orgId,
            ownerUserId: args.userId,
            provider: 'omicall',
            providerCallId: transactionId,
            direction,
            fromIdentity: direction === 'inbound' ? phoneNumber : args.extension,
            toIdentity: direction === 'inbound' ? args.extension : phoneNumber,
            ...data,
          },
        });
      }
      synced += 1;
    }

    if (items.length < pageSize) break;
    page += 1;
  }
  return { synced, total, pages };
}
