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
import { getOwnerScope } from '../rbac/owner-scope.js';

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
    // owner/admin → toàn công ty; leader/deputy phòng ban → phòng ban mình (subtree);
    // member thường → chỉ cuộc gọi của chính mình. Cùng quy tắc RBAC dept dùng ở
    // contacts/reports (getOwnerScope), KHÔNG dùng riêng legacy role owner/admin nữa.
    const scope = await getOwnerScope({ userId: current.id, orgId: current.orgId, legacyRole: current.role });
    const canViewOrganization = scope.canViewAll || scope.visibleUserIds.length > 1;
    const organizationScope = query.scope === 'organization' && canViewOrganization;
    let ownerUserIdFilter: Prisma.TelephonyCallWhereInput['ownerUserId'];
    if (!organizationScope) {
      ownerUserIdFilter = current.id;
    } else if (scope.canViewAll) {
      ownerUserIdFilter = query.ownerUserId || undefined;
    } else if (query.ownerUserId && scope.visibleUserIds.includes(query.ownerUserId)) {
      // Leader chọn 1 nhân viên cụ thể — chỉ cho phép nếu người đó thuộc phòng ban mình.
      ownerUserIdFilter = query.ownerUserId;
    } else {
      ownerUserIdFilter = { in: scope.visibleUserIds };
    }
    const where: Prisma.TelephonyCallWhereInput = {
      orgId: current.orgId,
      // Trang này chỉ hiển thị lịch sử Omicall — loại record cũ từ Stringee
      // (đã bị thay thế), vì recordingId của chúng là call-id nội bộ Stringee
      // (vd "call-vn-1-..."), không phải URL file nên không thể phát lại.
      provider: 'omicall',
      ...(ownerUserIdFilter !== undefined ? { ownerUserId: ownerUserIdFilter } : {}),
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
    const [calls, total, aggregate, missed, recordingCount] = await Promise.all([
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
    ]);
    const totalPages = Math.ceil(total / pageSize);
    return {
      calls,
      capabilities: {
        canViewOrganization,
        scopeLevel: scope.canViewAll ? 'organization' : 'team',
        // Leader/deputy phòng ban: id nhân viên trong phạm vi, để FE lọc dropdown
        // "nhân viên" đúng phòng ban thay vì liệt kê cả công ty.
        ...(scope.canViewAll ? {} : { scopeUserIds: scope.visibleUserIds }),
      },
      summary: {
        total,
        missed,
        recordings: recordingCount,
        totalDurationSec: aggregate._sum.durationSec || 0,
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
      return await syncOmicallHistoryForUser({
        userId: current.id,
        orgId: current.orgId,
        extension: me.omicallExtension,
        days: Number.isFinite(requestedDays) ? requestedDays : 30,
      });
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
      externalNumber = normalizePhone(body.phoneNumber);
      if (!externalNumber || !externalNumber.startsWith('84') || externalNumber.length < 11 || externalNumber.length > 12) {
        return reply.status(400).send({ error: 'Số điện thoại Việt Nam không hợp lệ' });
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
    };
    if (body.status && !STATUSES.has(body.status)) return reply.status(400).send({ error: 'Trạng thái cuộc gọi không hợp lệ' });
    const existing = await prisma.telephonyCall.findFirst({ where: { id, orgId: current.orgId, ownerUserId: current.id } });
    if (!existing) return reply.status(404).send({ error: 'Không tìm thấy cuộc gọi' });
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
      },
    });
    return call;
  });
}
