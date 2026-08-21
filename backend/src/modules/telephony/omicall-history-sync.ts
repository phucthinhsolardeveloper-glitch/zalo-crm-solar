// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { persistOmicallRecording } from './omicall-recording.js';
import { forwardCallToCrm } from './omicall-crm-forward.js';

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

      // FIX 2026-08-20 (crm-custom bị 429 flood): mỗi lần sync trước đây forward
      // LẠI toàn bộ cuộc gọi trong khoảng lookback (kể cả đã forward ở lần sync
      // trước) vì chưa check đã lưu DB chưa trước khi gọi forwardCallToCrm().
      // Sync chạy mỗi lần softphone connect → gửi lặp hàng chục webhook giống hệt
      // nhau liên tục, bị crm-custom rate-limit. Giờ chỉ forward khi đây THỰC SỰ
      // là lần đầu ghi nhận cuộc gọi này (pending vừa chuyển terminal, hoặc chưa
      // từng có record providerCallId này trong DB).
      const existing = await prisma.telephonyCall.findUnique({
        where: { ownerUserId_providerCallId: { ownerUserId: args.userId, providerCallId: transactionId } },
        select: { id: true },
      });
      const alreadySynced = pending ? false : Boolean(existing);

      // Relay to crm-custom — same terminal-state forward as the live webhook
      // path (omicall-public-routes.ts), reusing forwardCallToCrm() with a
      // payload built from Call Transaction v3 fields (mostly the same field
      // names as the webhook CDR shape crm-custom already expects).
      if (!alreadySynced && ['completed', 'missed', 'rejected'].includes(status)) {
        forwardCallToCrm({
          call_uuid: transactionId,
          state: 'cdr',
          direction,
          phone_number: phoneNumber,
          sip_user: args.extension,
          bill_sec: durationSec,
          answer_sec: Number(item.answer_sec ?? 0),
          disposition: item.disposition ?? null,
          hangup_cause: item.hangup_cause || item.invite_failure_status || null,
          endby_name: item.endby_name ?? null,
          recording_file_url: item.recording_file_url ?? null,
          time_start_call: item.time_start_call ?? item.created_date ?? null,
        });
      }

      // BUG 2026-08-20 (phát hiện lúc verify E2E, KHÔNG phải mới gây ra bởi đợt sửa này):
      // trước đây nếu VỪA có `pending` (row tạo sống lúc bấm gọi, providerCallId=null)
      // VỪA đã có `existing` (row transactionId này từ 1 lần sync TRƯỚC — vd sync chạy
      // lại, hoặc 2 lần bấm gọi cùng số/khoảng thời gian tạo 2 `pending` gần nhau), code cũ
      // luôn ưu tiên update `pending` → set providerCallId trùng với `existing` → vỡ unique
      // constraint (ownerUserId, providerCallId) → toàn bộ sync 502, dừng giữa chừng, các
      // cuộc gọi sau trong cùng trang KHÔNG được đồng bộ. Giờ ưu tiên `existing` (đã có
      // transactionId này rồi thì đó là bản ghi canonical) — `pending` bị bỏ qua an toàn
      // thay vì cố ghi đè gây lỗi (sẽ còn là 1 dòng "Đang khởi tạo" mồ côi, dọn riêng).
      if (existing) {
        await prisma.telephonyCall.update({ where: { id: existing.id }, data });
      } else if (pending) {
        await prisma.telephonyCall.update({
          where: { id: pending.id },
          data: { providerCallId: transactionId, ...data },
        });
      } else {
        await prisma.telephonyCall.create({
          data: {
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
  // Một lần bấm gọi tạo row `initiated` trước khi OmiCall trả transactionId. Nếu SDK,
  // webhook và history sync đều không trả kết quả (mạng rớt/tab đóng/provider lỗi), row
  // này trước đây treo vĩnh viễn và làm Call History báo sai trạng thái. 15 phút vượt xa
  // thời gian ringing hợp lệ; kết thúc mềm để giữ audit trail/notes thay vì xóa dữ liệu.
  await prisma.telephonyCall.updateMany({
    where: {
      orgId: args.orgId,
      ownerUserId: args.userId,
      provider: 'omicall',
      providerCallId: null,
      status: { in: ['initiated', 'ringing'] },
      startedAt: { lt: new Date(Date.now() - 15 * 60_000) },
    },
    data: {
      status: 'failed',
      endedAt: new Date(),
      endReason: 'Không nhận được trạng thái kết thúc từ tổng đài',
    },
  });

  return { synced, total, pages };
}
