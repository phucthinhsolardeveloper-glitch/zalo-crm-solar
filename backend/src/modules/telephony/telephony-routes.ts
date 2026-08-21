// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware, requireActiveUser } from '../auth/auth-middleware.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { logger } from '../../shared/utils/logger.js';
import { checkZaloAccess } from '../zalo/zalo-access-middleware.js';
import { syncOmicallHistoryForUser } from './omicall-history-sync.js';
import { decryptOmicallSecret } from './omicall-token.js';
import { listUnassignedOmicallExtensions } from './omicall-directory.js';
import { getObjectBuffer, keyFromPublicUrl } from '../../shared/storage/minio-client.js';
import { assertSafeOutboundUrl } from '../../shared/utils/ssrf-guard.js';
import { isPrivateRecordingReference, readPrivateRecording } from './recording-storage.js';
import { getContactScope } from '../contacts/contact-scope.js';
import { callNotePhoneKey } from './call-note-scope.js';
import { callContactNumberVariants } from './call-contact-link.js';

const DIRECTIONS = new Set(['inbound', 'outbound']);
const STATUSES = new Set(['initiated', 'ringing', 'answered', 'completed', 'rejected', 'missed', 'failed']);
const CHANNELS = new Set(['internal', 'pstn', 'zcc']);

export function firstContactPhone(contact: {
  phone: string | null;
  phone2: string | null;
  phone3: string | null;
  phonesExtra: unknown;
}): string | null {
  const extra = Array.isArray(contact.phonesExtra)
    ? contact.phonesExtra.map((item: any) => String(item?.phone || ''))
    : [];
  return [contact.phone, contact.phone2, contact.phone3, ...extra]
    .map((value) => normalizePhone(String(value || '')))
    .find((value): value is string => Boolean(value?.startsWith('84') && value.length >= 11 && value.length <= 12)) || null;
}

function ensureConfigured(reply: FastifyReply): boolean {
  if (!config.omicallEnabled) {
    void reply.status(503).send({ error: 'Tổng đài chưa được bật' });
    return false;
  }
  if (!config.omicallDomain) {
    void reply.status(503).send({ error: 'Thiếu cấu hình domain tổng đài' });
    return false;
  }
  return true;
}

export async function telephonyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireActiveUser);

  app.get('/api/v1/telephony/omicall/connect-config', async (request, reply) => {
    if (!ensureConfigured(reply)) return;
    const current = request.user!;
    const me = await prisma.user.findFirst({
      where: { id: current.id, orgId: current.orgId },
      select: { omicallExtension: true, omicallExtensionSecret: true },
    });
    if (!me?.omicallExtension || !me.omicallExtensionSecret) {
      return reply.status(503).send({ error: 'Bạn chưa được gán extension tổng đài — liên hệ quản trị viên' });
    }
    const peers = await prisma.user.findMany({
      where: { orgId: current.orgId, isActive: true, id: { not: current.id }, omicallExtension: { not: null } },
      select: { id: true, fullName: true, avatarUrl: true, role: true, omicallExtension: true },
      orderBy: { fullName: 'asc' },
    });
    return {
      enabled: true,
      sipRealm: config.omicallDomain,
      wssUri: config.omicallWssUri || null,
      sipUser: me.omicallExtension,
      sipPassword: decryptOmicallSecret(me.omicallExtensionSecret),
      outboundNumberMode: config.omicallOutboundNumberMode,
      hotline: config.omicallHotline || null,
      zcc: {
        enabled: config.omicallZccEnabled && Boolean(config.omicallZccSipNumber),
        sipNumber: config.omicallZccSipNumber || null,
      },
      peers,
    };
  });

  // GET /api/v1/telephony/omicall/available-extensions — owner/admin only.
  // Lists extensions already provisioned on the OmiCall dashboard but not yet
  // linked to any user in this org — lets admin ASSIGN by picking instead of
  // typing sip_user/password by hand. Does not create extensions (no such API).
  app.get('/api/v1/telephony/omicall/available-extensions', async (request, reply) => {
    const current = request.user!;
    if (!['owner', 'admin'].includes(current.role)) {
      return reply.status(403).send({ error: 'Không có quyền' });
    }
    if (!ensureConfigured(reply)) return;
    try {
      const extensions = await listUnassignedOmicallExtensions(current.orgId);
      return { extensions };
    } catch (err) {
      logger.warn(`[telephony] available-extensions failed: ${(err as Error)?.message}`);
      return reply.status(502).send({ error: 'Không lấy được danh sách extension từ OmiCall' });
    }
  });

  app.post('/api/v1/telephony/omicall/resolve-conversation-target', async (request, reply) => {
    if (!ensureConfigured(reply)) return;
    const current = request.user!;
    const { conversationId } = (request.body || {}) as { conversationId?: string };
    if (!conversationId) return reply.status(400).send({ error: 'conversationId là bắt buộc' });

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, orgId: current.orgId, deletedAt: null },
      select: {
        id: true,
        contactId: true,
        threadType: true,
        zaloAccountId: true,
        zaloAccount: { select: { archivedAt: true, privacyMode: true, ownerUserId: true } },
        contact: {
          select: {
            id: true,
            fullName: true,
            crmName: true,
            avatarUrl: true,
            phone: true,
            phone2: true,
            phone3: true,
            phonesExtra: true,
          },
        },
      },
    });
    if (!conversation) return reply.status(404).send({ error: 'Không tìm thấy hội thoại' });
    if (conversation.threadType !== 'user') {
      return reply.status(422).send({ error: 'Không thể gọi ZCC tới hội thoại nhóm', code: 'group_call_not_supported' });
    }
    if (conversation.zaloAccount.archivedAt) {
      return reply.status(422).send({ error: 'Nick Zalo của hội thoại đã bị xóa', code: 'zalo_account_archived' });
    }
    const access = await checkZaloAccess({
      userId: current.id,
      orgId: current.orgId,
      role: current.role,
      zaloAccountId: conversation.zaloAccountId,
      minPermission: 'chat',
    });
    if (access !== 'ok') return reply.status(403).send({ error: 'Không đủ quyền gọi khách hàng trong hội thoại này' });
    const { buildPrivacyContext, canSeeConversationContent } = await import('../privacy/redact.js');
    const privacyCtx = await buildPrivacyContext(request);
    if (!canSeeConversationContent(conversation as any, privacyCtx)) {
      return reply.status(403).send({
        error: 'Cần mở khóa quyền riêng tư của nick trước khi gọi khách hàng',
        code: 'privacy_unlock_required',
      });
    }
    if (!conversation.contact) {
      return reply.status(422).send({ error: 'Hội thoại chưa liên kết khách hàng CRM', code: 'contact_missing' });
    }
    const phone = firstContactPhone(conversation.contact);
    if (!phone) {
      return reply.status(422).send({
        error: 'Khách hàng chưa có số điện thoại — cần bổ sung SĐT trước khi gọi qua OA công ty',
        code: 'customer_phone_missing',
      });
    }

    const zccReady = config.omicallZccEnabled && Boolean(config.omicallZccSipNumber);
    if (!zccReady) {
      return reply.status(503).send({
        error: 'Zalo OA/ZCC của công ty chưa được cấu hình',
        code: 'zcc_not_configured',
      });
    }
    return {
      conversationId: conversation.id,
      contactId: conversation.contact.id,
      remoteNumber: phone,
      remoteIdentityType: 'phone',
      channel: 'zcc',
      sipNumber: config.omicallZccSipNumber,
      contact: {
        id: conversation.contact.id,
        fullName: conversation.contact.crmName || conversation.contact.fullName || phone,
        avatarUrl: conversation.contact.avatarUrl,
        phone,
      },
    };
  });

  // GET /api/v1/telephony/dial-suggestions?q= — gợi ý khi gõ số trong popup gọi:
  // khớp tên/SĐT khách hàng có sẵn trong CRM, kèm trạng thái + thời gian cuộc gọi gần nhất
  // (nếu có) để sale biết đây là số quen hay lạ trước khi bấm gọi.
  app.get('/api/v1/telephony/dial-suggestions', async (request) => {
    const current = request.user!;
    const query = String((request.query as { q?: string })?.q || '').trim();
    const digitsOnly = query.replace(/\D/g, '');
    const scope = await getContactScope(current.id, current.orgId, current.role);
    const scopedContactIds = !scope.isOrgAdmin && scope.accessibleContactIds !== null
      ? scope.accessibleContactIds
      : null;

    // Click/focus khi chưa gõ: hiện ngay các số vừa gọi gần đây. Bản cũ trả [] nếu
    // q<2 nên người dùng tưởng tính năng không tồn tại, đúng như phản hồi thực tế.
    if (!query) {
      const recent = await prisma.telephonyCall.findMany({
        where: {
          orgId: current.orgId,
          provider: 'omicall',
          externalNumber: { not: null },
          ...(current.role === 'owner' || current.role === 'admin' ? {} : { ownerUserId: current.id }),
          ...(scopedContactIds ? { OR: [{ contactId: null }, { contactId: { in: scopedContactIds } }] } : {}),
        },
        orderBy: { startedAt: 'desc' },
        take: 30,
        select: {
          externalNumber: true, status: true, startedAt: true,
          contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true } },
        },
      });
      const seen = new Set<string>();
      return {
        suggestions: recent.flatMap((call) => {
          const phone = call.externalNumber || '';
          if (!phone || seen.has(phone)) return [];
          seen.add(phone);
          return [{
            contactId: call.contact?.id || null,
            fullName: call.contact?.crmName || call.contact?.fullName || null,
            avatarUrl: call.contact?.avatarUrl || null,
            phone,
            lastCall: { status: call.status, startedAt: call.startedAt },
          }];
        }).slice(0, 8),
      };
    }

    const digitTerms = new Set<string>();
    if (digitsOnly) {
      digitTerms.add(digitsOnly);
      if (digitsOnly.startsWith('0') && digitsOnly.length > 1) digitTerms.add(`84${digitsOnly.slice(1)}`);
    }

    const contacts = await prisma.contact.findMany({
      where: {
        orgId: current.orgId,
        mergedInto: null,
        ...(scopedContactIds ? { id: { in: scopedContactIds } } : {}),
        OR: [
          ...[...digitTerms].flatMap((term) => [
            { phone: { contains: term } },
            { phone2: { contains: term } },
            { phone3: { contains: term } },
          ]),
          { fullName: { contains: query, mode: 'insensitive' as const } },
          { crmName: { contains: query, mode: 'insensitive' as const } },
        ],
      },
      select: { id: true, fullName: true, crmName: true, phone: true, avatarUrl: true },
      orderBy: { lastActivity: { sort: 'desc', nulls: 'last' } },
      take: 8,
    });

    const contactIds = contacts.map((c) => c.id);
    const recentCalls = contactIds.length
      ? await prisma.telephonyCall.findMany({
          where: { orgId: current.orgId, contactId: { in: contactIds } },
          orderBy: { startedAt: 'desc' },
          select: { contactId: true, status: true, startedAt: true },
        })
      : [];
    const lastCallByContact = new Map<string, { status: string; startedAt: Date }>();
    for (const call of recentCalls) {
      if (call.contactId && !lastCallByContact.has(call.contactId)) lastCallByContact.set(call.contactId, call);
    }

    const suggestions = contacts
      .filter((c) => c.phone)
      .map((c) => ({
        contactId: c.id,
        fullName: c.crmName || c.fullName || null,
        avatarUrl: c.avatarUrl,
        phone: c.phone,
        lastCall: lastCallByContact.get(c.id) || null,
      }));
    return { suggestions };
  });

  // GET /api/v1/telephony/contacts/:contactId/latest-call — cuộc gọi gần nhất + ghi chú
  // mới nhất của KH này, cho hover-preview ở khung chat (ChatContactPanel.vue). Đọc-only,
  // scope theo org (giống các thông tin KH khác đã hiện sẵn trong panel chat).
  app.get('/api/v1/telephony/contacts/:contactId/latest-call', async (request) => {
    const current = request.user!;
    const { contactId } = request.params as { contactId: string };
    const call = await prisma.telephonyCall.findFirst({
      where: { orgId: current.orgId, contactId },
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, startedAt: true, direction: true, externalNumber: true, channel: true },
    });
    if (!call) return { call: null, latestNote: null };
    const phoneKey = callNotePhoneKey(call.externalNumber, call.channel);
    const latestNote = await prisma.callNote.findFirst({
      where: {
        orgId: current.orgId,
        ...(phoneKey ? { phoneKey } : { callId: call.id }),
        ...(current.role === 'owner' || current.role === 'admin' ? {} : { call: { ownerUserId: current.id } }),
      },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { id: true, fullName: true } } },
    });
    return { call, latestNote };
  });

  app.get('/api/v1/telephony/calls', async (request) => {
    const current = request.user!;
    const query = request.query as {
      page?: string;
      pageSize?: string;
      limit?: string;
      scope?: string;
      ownerUserId?: string;
      direction?: string;
      status?: string;
      channel?: string;
      recording?: string;
      from?: string;
      to?: string;
      search?: string;
    };
    const page = Math.max(Math.floor(Number(query.page) || 1), 1);
    const pageSize = Math.min(Math.max(Math.floor(Number(query.pageSize || query.limit) || 20), 1), 100);
    const canViewOrganization = current.role === 'owner' || current.role === 'admin';
    const organizationScope = query.scope === 'organization' && canViewOrganization;
    const where: Prisma.TelephonyCallWhereInput = {
      orgId: current.orgId,
      // Trang này chỉ hiển thị lịch sử Omicall — loại record cũ từ Stringee
      // (đã bị thay thế), vì recordingId của chúng là call-id nội bộ Stringee
      // (vd "call-vn-1-..."), không phải URL file nên không thể phát lại.
      provider: 'omicall',
      ...(!organizationScope
        ? { ownerUserId: current.id }
        : query.ownerUserId
          ? { ownerUserId: query.ownerUserId }
          : {}),
    };
    if (query.direction && DIRECTIONS.has(query.direction)) where.direction = query.direction;
    if (query.status && STATUSES.has(query.status)) where.status = query.status;
    if (query.channel && CHANNELS.has(query.channel)) where.channel = query.channel;
    if (query.recording === 'true') where.recordingId = { not: null };
    if (query.from || query.to) {
      where.startedAt = {};
      if (query.from) {
        const from = new Date(query.from);
        if (!Number.isNaN(from.getTime())) where.startedAt.gte = from;
      }
      if (query.to) {
        const to = new Date(query.to);
        if (!Number.isNaN(to.getTime())) where.startedAt.lte = to;
      }
    }
    const search = String(query.search || '').trim().slice(0, 100);
    if (search) {
      where.OR = [
        { externalNumber: { contains: search, mode: 'insensitive' } },
        { externalIdentity: { contains: search, mode: 'insensitive' } },
        { contact: { is: { fullName: { contains: search, mode: 'insensitive' } } } },
        { contact: { is: { crmName: { contains: search, mode: 'insensitive' } } } },
        ...(organizationScope
          ? [{ ownerUser: { is: { fullName: { contains: search, mode: 'insensitive' as const } } } }]
          : []),
      ];
    }
    const [calls, total, aggregate, missed, recordingCount, answered, analyticsRows] = await Promise.all([
      prisma.telephonyCall.findMany({
        where,
        include: {
          ownerUser: { select: { id: true, fullName: true, avatarUrl: true } },
          peerUser: { select: { id: true, fullName: true, avatarUrl: true } },
          contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.telephonyCall.count({ where }),
      prisma.telephonyCall.aggregate({ where, _sum: { durationSec: true } }),
      prisma.telephonyCall.count({ where: { ...where, status: { in: ['missed', 'failed', 'rejected'] } } }),
      prisma.telephonyCall.count({ where: { ...where, recordingId: { not: null } } }),
      prisma.telephonyCall.count({ where: { ...where, status: { in: ['answered', 'completed'] } } }),
      prisma.telephonyCall.findMany({
        where,
        select: {
          startedAt: true,
          status: true,
          durationSec: true,
          ownerUserId: true,
          ownerUser: { select: { fullName: true } },
        },
        orderBy: { startedAt: 'asc' },
      }),
    ]);
    // Latest note theo ĐẦU SỐ. callId vẫn là audit source; PSTN/ZCC cùng phoneKey
    // dùng chung timeline, internal/number lỗi mới fallback theo callId.
    const phoneKeyByCallId = new Map(calls.map((c) => [c.id, callNotePhoneKey(c.externalNumber, c.channel)]));
    const phoneKeys = [...new Set([...phoneKeyByCallId.values()].filter((v): v is string => Boolean(v)))];
    const directCallIds = calls.filter((c) => !phoneKeyByCallId.get(c.id)).map((c) => c.id);
    const latestNoteByCallId = new Map<string, { id: string; body: string; createdAt: Date; author: { id: string; fullName: string } }>();
    const latestNoteByPhoneKey = new Map<string, { id: string; body: string; createdAt: Date; author: { id: string; fullName: string } }>();
    if (phoneKeys.length || directCallIds.length) {
      const recentNotes = await prisma.callNote.findMany({
        where: {
          orgId: current.orgId,
          OR: [
            ...(phoneKeys.length ? [{ phoneKey: { in: phoneKeys } }] : []),
            ...(directCallIds.length ? [{ callId: { in: directCallIds } }] : []),
          ],
          ...(!organizationScope ? { call: { ownerUserId: current.id } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        include: { author: { select: { id: true, fullName: true } } },
      });
      for (const note of recentNotes) {
        if (note.phoneKey && !latestNoteByPhoneKey.has(note.phoneKey)) latestNoteByPhoneKey.set(note.phoneKey, note);
        if (!latestNoteByCallId.has(note.callId)) latestNoteByCallId.set(note.callId, note);
      }
    }
    const callsWithLatestNote = calls.map((c) => {
      const phoneKey = phoneKeyByCallId.get(c.id);
      return { ...c, latestNote: (phoneKey ? latestNoteByPhoneKey.get(phoneKey) : latestNoteByCallId.get(c.id)) ?? null };
    });

    // UTC+7 cố định (Việt Nam không DST) để biểu đồ ngày/khung giờ không lệch theo
    // timezone của container. Các thống kê dùng đúng tập filter/scope ở phía trên.
    const localParts = (value: Date) => {
      const local = new Date(value.getTime() + 7 * 60 * 60 * 1000);
      return { day: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
    };
    const isAnswered = (status: string) => status === 'answered' || status === 'completed';
    const daily = new Map<string, { date: string; total: number; answered: number; missed: number; durationSec: number }>();
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, answered: 0 }));
    const employees = new Map<string, {
      userId: string; fullName: string; total: number; answered: number; missed: number; totalDurationSec: number;
    }>();
    for (const row of analyticsRows) {
      const { day, hour } = localParts(row.startedAt);
      const connected = isAnswered(row.status);
      const noConnection = ['missed', 'failed', 'rejected'].includes(row.status);
      const durationSec = row.durationSec || 0;
      const dayPoint = daily.get(day) || { date: day, total: 0, answered: 0, missed: 0, durationSec: 0 };
      dayPoint.total += 1;
      dayPoint.answered += connected ? 1 : 0;
      dayPoint.missed += noConnection ? 1 : 0;
      dayPoint.durationSec += durationSec;
      daily.set(day, dayPoint);
      hourly[hour].total += 1;
      hourly[hour].answered += connected ? 1 : 0;
      const employee = employees.get(row.ownerUserId) || {
        userId: row.ownerUserId,
        fullName: row.ownerUser.fullName,
        total: 0,
        answered: 0,
        missed: 0,
        totalDurationSec: 0,
      };
      employee.total += 1;
      employee.answered += connected ? 1 : 0;
      employee.missed += noConnection ? 1 : 0;
      employee.totalDurationSec += durationSec;
      employees.set(row.ownerUserId, employee);
    }
    const employeeRanking = [...employees.values()]
      .map((row) => ({
        ...row,
        answerRate: row.total ? Math.round((row.answered / row.total) * 1000) / 10 : 0,
        avgDurationSec: row.answered ? Math.round(row.totalDurationSec / row.answered) : 0,
      }))
      .sort((a, b) => b.answered - a.answered || b.totalDurationSec - a.totalDurationSec || b.total - a.total);

    const totalPages = Math.ceil(total / pageSize);
    return {
      calls: callsWithLatestNote,
      capabilities: { canViewOrganization },
      summary: {
        total,
        missed,
        recordings: recordingCount,
        totalDurationSec: aggregate._sum.durationSec || 0,
        answered,
        answerRate: total ? Math.round((answered / total) * 1000) / 10 : 0,
        avgDurationSec: answered ? Math.round((aggregate._sum.durationSec || 0) / answered) : 0,
      },
      analytics: {
        dailyTrend: [...daily.values()],
        hourlyDistribution: hourly,
        employeeRanking,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  });

  app.post('/api/v1/telephony/omicall/sync', async (request, reply) => {
    if (!ensureConfigured(reply)) return;
    if (!config.omicallApiKey) {
      return reply.status(503).send({
        error: 'Thiếu API key để đồng bộ lịch sử tổng đài',
        code: 'omicall_api_key_missing',
      });
    }
    const current = request.user!;
    const me = await prisma.user.findFirst({
      where: { id: current.id, orgId: current.orgId },
      select: { omicallExtension: true },
    });
    if (!me?.omicallExtension) {
      return reply.status(503).send({ error: 'Bạn chưa được gán extension tổng đài' });
    }
    const requestedDays = Number((request.body as { days?: number } | undefined)?.days);
    try {
      const result = await syncOmicallHistoryForUser({
        userId: current.id,
        orgId: current.orgId,
        extension: me.omicallExtension,
        days: Number.isFinite(requestedDays) ? requestedDays : 30,
      });
      (app as any).io?.to(`org:${current.orgId}`).emit('telephony:call-changed', {
        callIds: [],
      });
      return result;
    } catch (error: any) {
      logger.warn({ userId: current.id, error: error?.message }, '[omicall-history] sync failed');
      return reply.status(502).send({ error: error?.message || 'Không đồng bộ được lịch sử tổng đài' });
    }
  });

  app.post('/api/v1/telephony/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureConfigured(reply)) return;
    const current = request.user!;
    const body = request.body as {
      peerUserId?: string;
      phoneNumber?: string;
      direction?: string;
      providerCallId?: string;
      channel?: string;
      conversationId?: string;
      contactId?: string;
    };
    if (!body.direction || !DIRECTIONS.has(body.direction) || Boolean(body.peerUserId) === Boolean(body.phoneNumber)) {
      return reply.status(400).send({ error: 'Cần đúng một peerUserId hoặc phoneNumber và direction hợp lệ' });
    }
    const channel = body.peerUserId ? 'internal' : (body.channel || 'pstn');
    if (!CHANNELS.has(channel)) return reply.status(400).send({ error: 'Kênh cuộc gọi không hợp lệ' });
    let peer: { id: string; omicallExtension: string | null } | null = null;
    let contact: { id: string } | null = null;
    let conversation: {
      id: string;
      contactId: string | null;
      zaloAccountId: string;
      zaloAccount: { privacyMode: string; ownerUserId: string | null };
    } | null = null;
    let externalNumber: string | null = null;
    if (body.peerUserId) {
      peer = await prisma.user.findFirst({
        where: { id: body.peerUserId, orgId: current.orgId, isActive: true },
        select: { id: true, omicallExtension: true },
      });
      if (!peer || peer.id === current.id) return reply.status(404).send({ error: 'Không tìm thấy nhân viên nhận cuộc gọi' });
    } else {
      // FIX 2026-08-20: trước đây re-check STRICT (84 + 11-12 digit) sau khi đã qua
      // normalizePhone() LOOSE → chặn nhầm số lịch sử/số nước ngoài mà normalizePhone()
      // đã chấp nhận hợp lệ (vd số bàn, số nước ngoài giữ nguyên digits). Chỉ cần
      // normalizePhone() trả về non-null là đủ — nó đã tự loại input rác (<9 hoặc >13 digit).
      externalNumber = normalizePhone(body.phoneNumber);
      if (!externalNumber) {
        return reply.status(400).send({ error: 'Số điện thoại không hợp lệ' });
      }
      const variants = phoneVariants(externalNumber);
      contact = await prisma.contact.findFirst({
        where: {
          orgId: current.orgId,
          mergedInto: null,
          ...(body.contactId
            ? { id: body.contactId }
            : { OR: [{ phoneNormalized: externalNumber }, { phone: { in: variants } }, { phone2: { in: variants } }, { phone3: { in: variants } }] }),
        },
        select: { id: true },
      });
      if (body.contactId && !contact) return reply.status(404).send({ error: 'Không tìm thấy khách hàng' });
      if (body.conversationId) {
        conversation = await prisma.conversation.findFirst({
          where: { id: body.conversationId, orgId: current.orgId },
          select: {
            id: true,
            contactId: true,
            zaloAccountId: true,
            zaloAccount: { select: { privacyMode: true, ownerUserId: true } },
          },
        });
        if (!conversation || (contact && conversation.contactId !== contact.id)) {
          return reply.status(400).send({ error: 'Hội thoại không khớp khách hàng cuộc gọi' });
        }
        const access = await checkZaloAccess({
          userId: current.id,
          orgId: current.orgId,
          role: current.role,
          zaloAccountId: conversation.zaloAccountId,
          minPermission: 'chat',
        });
        if (access !== 'ok') return reply.status(403).send({ error: 'Không đủ quyền gọi từ hội thoại này' });
        const { buildPrivacyContext, canSeeConversationContent } = await import('../privacy/redact.js');
        const privacyCtx = await buildPrivacyContext(request);
        if (!canSeeConversationContent(conversation as any, privacyCtx)) {
          return reply.status(403).send({ error: 'Cần mở khóa quyền riêng tư của nick trước khi gọi khách hàng' });
        }
      }
    }
    const ownExt = (await prisma.user.findFirst({ where: { id: current.id }, select: { omicallExtension: true } }))?.omicallExtension || '';
    const peerExt = peer?.omicallExtension || null;
    const fromIdentity = body.direction === 'inbound' ? (peerExt || externalNumber!) : ownExt;
    const toIdentity = body.direction === 'inbound' ? ownExt : (peerExt || externalNumber!);
    const call = await prisma.telephonyCall.create({
      data: {
        orgId: current.orgId,
        ownerUserId: current.id,
        peerUserId: peer?.id || null,
        contactId: contact?.id || null,
        conversationId: conversation?.id || null,
        externalNumber,
        externalIdentity: peerExt || externalNumber,
        externalIdentityType: peer ? 'extension' : 'phone',
        channel,
        provider: 'omicall',
        providerCallId: body.providerCallId || null,
        direction: body.direction,
        status: body.direction === 'inbound' ? 'ringing' : 'initiated',
        fromIdentity,
        toIdentity,
      },
      include: {
        peerUser: { select: { id: true, fullName: true, avatarUrl: true } },
        contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } },
      },
    });
    (app as any).io?.to(`org:${current.orgId}`).emit('telephony:call-changed', {
      callIds: [call.id],
      status: call.status,
    });
    return reply.status(201).send(call);
  });

  app.patch('/api/v1/telephony/calls/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const current = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: string;
      providerCallId?: string;
      durationSec?: number;
      endReason?: string;
      contactId?: string | null;
    };
    if (body.status && !STATUSES.has(body.status)) return reply.status(400).send({ error: 'Trạng thái cuộc gọi không hợp lệ' });
    // contactId link (vd "Tạo khách hàng" từ số lạ ở Call History) — admin/owner có thể
    // gắn cho MỌI cuộc gọi trong org; các field khác (status/duration/...) chỉ chính chủ
    // cuộc gọi mới sửa được (vòng đời cuộc gọi, không phải hành động quản trị).
    const canLinkAnyCall = current.role === 'owner' || current.role === 'admin';
    const existing = await prisma.telephonyCall.findFirst({
      where: { id, orgId: current.orgId, ...(canLinkAnyCall ? {} : { ownerUserId: current.id }) },
    });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy cuộc gọi' });
    const mutatingLifecycleFields = body.status || body.providerCallId || body.durationSec !== undefined || body.endReason;
    if (mutatingLifecycleFields && existing.ownerUserId !== current.id) {
      return reply.status(403).send({ error: 'Chỉ chính chủ cuộc gọi mới sửa được trạng thái' });
    }
    if (body.contactId) {
      const contact = await prisma.contact.findFirst({ where: { id: body.contactId, orgId: current.orgId }, select: { id: true } });
      if (!contact) return reply.status(404).send({ error: 'Không tìm thấy khách hàng' });
    }
    const now = new Date();
    const ending = body.status && ['completed', 'rejected', 'missed', 'failed'].includes(body.status);
    const call = await prisma.telephonyCall.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status } : {}),
        ...(body.providerCallId ? { providerCallId: body.providerCallId } : {}),
        ...(body.status === 'answered' && !existing.answeredAt ? { answeredAt: now } : {}),
        ...(ending && !existing.endedAt ? { endedAt: now } : {}),
        ...(Number.isFinite(body.durationSec) ? { durationSec: Math.max(0, Math.round(body.durationSec!)) } : {}),
        ...(body.endReason ? { endReason: body.endReason.slice(0, 255) } : {}),
        ...(body.contactId ? { contactId: body.contactId } : {}),
      },
      include: { contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } } },
    });
    (app as any).io?.to(`org:${current.orgId}`).emit('telephony:call-changed', {
      callIds: [call.id],
      status: call.status,
    });

    // Liên kết theo đầu số, không theo riêng một row lịch sử: sau khi sale xác nhận
    // số này là KH nào, các cuộc gọi chưa gắn của cùng số trong phạm vi họ được phép
    // quản lý cũng phải đi theo KH đó. Không ghi đè row đã gắn KH khác.
    let linkedCallIds = [call.id];
    if (body.contactId && existing.channel !== 'internal') {
      const variants = callContactNumberVariants(existing.externalNumber);
      if (variants.length > 0) {
        const siblingCalls = await prisma.telephonyCall.findMany({
          where: {
            orgId: current.orgId,
            ...(canLinkAnyCall ? {} : { ownerUserId: current.id }),
            contactId: null,
            externalNumber: { in: variants },
          },
          select: { id: true },
        });
        const siblingIds = siblingCalls.map((item) => item.id).filter((callId) => callId !== call.id);
        if (siblingIds.length > 0) {
          await prisma.telephonyCall.updateMany({
            where: { id: { in: siblingIds }, orgId: current.orgId, contactId: null },
            data: { contactId: body.contactId },
          });
          linkedCallIds = [call.id, ...siblingIds];
        }
      }

      const io = (app as any).io;
      io?.to(`org:${current.orgId}`).emit('telephony:contact-linked', {
        contactId: body.contactId,
        callIds: linkedCallIds,
      });
    }
    return { ...call, linkedCallIds, linkedCallCount: linkedCallIds.length };
  });

  // ── Call notes — timeline theo đầu số; callId giữ lại làm audit source ──
  async function assertCallVisible(orgId: string, userId: string, role: string, callId: string) {
    const canViewOrganization = role === 'owner' || role === 'admin';
    return prisma.telephonyCall.findFirst({
      where: { id: callId, orgId, ...(canViewOrganization ? {} : { ownerUserId: userId }) },
      select: { id: true, externalNumber: true, channel: true },
    });
  }

  app.get('/api/v1/telephony/calls/:id/notes', async (request: FastifyRequest, reply: FastifyReply) => {
    const current = request.user!;
    const { id } = request.params as { id: string };
    const call = await assertCallVisible(current.orgId, current.id, current.role, id);
    if (!call) return reply.status(404).send({ error: 'Không tìm thấy cuộc gọi' });
    const phoneKey = callNotePhoneKey(call.externalNumber, call.channel);
    const notes = await prisma.callNote.findMany({
      where: {
        orgId: current.orgId,
        ...(phoneKey ? { phoneKey } : { callId: id }),
        ...(current.role === 'owner' || current.role === 'admin' ? {} : { call: { ownerUserId: current.id } }),
      },
      // Newest first — timeline dùng chung của đầu số.
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        call: { select: { id: true, startedAt: true, direction: true } },
      },
    });
    return { notes, scope: phoneKey ? 'phone' : 'call', phoneKey };
  });

  app.post('/api/v1/telephony/calls/:id/notes', async (request: FastifyRequest, reply: FastifyReply) => {
    const current = request.user!;
    const { id } = request.params as { id: string };
    const body = request.body as { body?: string };
    const text = (body.body || '').trim();
    if (!text) return reply.status(400).send({ error: 'Nội dung ghi chú không được để trống' });
    if (text.length > 4000) return reply.status(400).send({ error: 'Ghi chú quá dài (tối đa 4000 ký tự)' });
    const call = await assertCallVisible(current.orgId, current.id, current.role, id);
    if (!call) return reply.status(404).send({ error: 'Không tìm thấy cuộc gọi' });
    const phoneKey = callNotePhoneKey(call.externalNumber, call.channel);
    const note = await prisma.callNote.create({
      data: { orgId: current.orgId, callId: id, phoneKey, authorUserId: current.id, body: text },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        call: { select: { id: true, startedAt: true, direction: true } },
      },
    });
    return reply.status(201).send(note);
  });

  // ── Recording playback — proxy qua auth, KHÔNG lộ URL kho ─────────────────
  // File ghi âm mới được mã hóa trong namespace riêng. Endpoint này kiểm tra quyền
  // xem cuộc gọi (assertCallVisible — chủ cuộc gọi hoặc owner/admin) trước khi trả byte,
  // và xử lý êm URL hỏng/hết hạn thay vì để trình phát lỗi trắng.
  app.get('/api/v1/telephony/calls/:id/recording', async (request: FastifyRequest, reply: FastifyReply) => {
    const current = request.user!;
    const { id } = request.params as { id: string };
    const call = await assertCallVisible(current.orgId, current.id, current.role, id);
    if (!call) return reply.status(404).send({ error: 'Không tìm thấy cuộc gọi' });

    const full = await prisma.telephonyCall.findUnique({ where: { id }, select: { recordingId: true } });
    const url = full?.recordingId;
    if (!url) return reply.status(404).send({ error: 'Cuộc gọi này không có ghi âm' });

    if (isPrivateRecordingReference(url)) {
      try {
        const buf = await readPrivateRecording(url);
        if (!buf) return reply.status(410).send({ error: 'Ghi âm không còn khả dụng (đã bị xóa khỏi kho lưu trữ).' });
        reply.header('Content-Type', 'audio/mpeg').header('Cache-Control', 'private, no-store');
        return reply.send(buf);
      } catch (error) {
        logger.error({ callId: id, error: (error as Error).message }, '[telephony] encrypted recording read failed');
        return reply.status(500).send({ error: 'Không giải mã được ghi âm.' });
      }
    }

    // Tương thích dữ liệu mirror cũ trong giai đoạn migration.
    const key = keyFromPublicUrl(url);
    if (key) {
      const buf = await getObjectBuffer(key);
      if (!buf) return reply.status(410).send({ error: 'Ghi âm không còn khả dụng (đã bị xóa khỏi kho lưu trữ).' });
      reply.header('Content-Type', 'audio/mpeg').header('Cache-Control', 'private, max-age=0');
      return reply.send(buf);
    }

    // Mirror lúc lưu CDR thất bại → recordingId là URL gốc từ OmiCall (có thể đã hết hạn).
    // Fetch lại theo yêu cầu, KHÔNG lộ URL gốc cho FE — trả lỗi rõ ràng nếu hết hạn/không tải được.
    try {
      const safeUrl = assertSafeOutboundUrl(url);
      const upstream = await fetch(safeUrl, { signal: AbortSignal.timeout(15_000) });
      if (!upstream.ok || !upstream.body) {
        return reply.status(410).send({ error: 'Ghi âm không còn khả dụng (đường dẫn từ tổng đài đã hết hạn).' });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      reply.header('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg').header('Cache-Control', 'private, max-age=0');
      return reply.send(buf);
    } catch (error) {
      logger.warn({ callId: id, error: (error as Error).message }, '[telephony] recording fetch failed');
      return reply.status(502).send({ error: 'Không tải được ghi âm từ tổng đài.' });
    }
  });
}
