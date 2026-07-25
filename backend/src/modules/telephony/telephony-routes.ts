// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware, requireActiveUser } from '../auth/auth-middleware.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { decryptOmicallSecret } from './omicall-token.js';

const DIRECTIONS = new Set(['inbound', 'outbound']);
const STATUSES = new Set(['initiated', 'ringing', 'answered', 'completed', 'rejected', 'missed', 'failed']);

function ensureConfigured(reply: FastifyReply): boolean {
  if (!config.omicallEnabled) {
    void reply.status(503).send({ error: 'Tổng đài Omicall chưa được bật' });
    return false;
  }
  if (!config.omicallDomain) {
    void reply.status(503).send({ error: 'Thiếu OMICALL_DOMAIN' });
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
      return reply.status(503).send({ error: 'Bạn chưa được gán extension Omicall — liên hệ quản trị viên' });
    }
    const peers = await prisma.user.findMany({
      where: { orgId: current.orgId, isActive: true, id: { not: current.id }, omicallExtension: { not: null } },
      select: { id: true, fullName: true, avatarUrl: true, role: true, omicallExtension: true },
      orderBy: { fullName: 'asc' },
    });
    return {
      enabled: true,
      sipRealm: config.omicallDomain,
      sipUser: me.omicallExtension,
      sipPassword: decryptOmicallSecret(me.omicallExtensionSecret),
      hotline: config.omicallHotline || null,
      peers,
    };
  });

  app.get('/api/v1/telephony/calls', async (request) => {
    const current = request.user!;
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
    const calls = await prisma.telephonyCall.findMany({
      where: { orgId: current.orgId, ownerUserId: current.id },
      include: {
        peerUser: { select: { id: true, fullName: true, avatarUrl: true } },
        contact: { select: { id: true, fullName: true, crmName: true, avatarUrl: true, phone: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return { calls };
  });

  app.post('/api/v1/telephony/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureConfigured(reply)) return;
    const current = request.user!;
    const body = request.body as { peerUserId?: string; phoneNumber?: string; direction?: string; providerCallId?: string };
    if (!body.direction || !DIRECTIONS.has(body.direction) || Boolean(body.peerUserId) === Boolean(body.phoneNumber)) {
      return reply.status(400).send({ error: 'Cần đúng một peerUserId hoặc phoneNumber và direction hợp lệ' });
    }
    let peer: { id: string; omicallExtension: string | null } | null = null;
    let contact: { id: string } | null = null;
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
          OR: [{ phoneNormalized: externalNumber }, { phone: { in: variants } }, { phone2: { in: variants } }, { phone3: { in: variants } }],
        },
        select: { id: true },
      });
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
        externalNumber,
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
