// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware, requireActiveUser } from '../auth/auth-middleware.js';
import { createStringeeClientToken, stringeeIdentity } from './stringee-token.js';

const DIRECTIONS = new Set(['inbound', 'outbound']);
const STATUSES = new Set(['initiated', 'ringing', 'answered', 'completed', 'rejected', 'missed', 'failed']);

function ensureConfigured(reply: FastifyReply): boolean {
  if (!config.stringeeEnabled) {
    void reply.status(503).send({ error: 'Tổng đài Stringee chưa được bật' });
    return false;
  }
  if (!config.stringeeApiKeySid || !config.stringeeApiKeySecret) {
    void reply.status(503).send({ error: 'Thiếu STRINGEE_API_KEY_SID hoặc STRINGEE_API_KEY_SECRET' });
    return false;
  }
  return true;
}

export async function telephonyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requireActiveUser);

  app.get('/api/v1/telephony/stringee/token', async (request, reply) => {
    if (!ensureConfigured(reply)) return;
    const current = request.user!;
    const peers = await prisma.user.findMany({
      where: { orgId: current.orgId, isActive: true, id: { not: current.id } },
      select: { id: true, fullName: true, avatarUrl: true, role: true },
      orderBy: { fullName: 'asc' },
    });
    const userId = stringeeIdentity(current.id);
    const token = createStringeeClientToken({
      apiKeySid: config.stringeeApiKeySid,
      apiKeySecret: config.stringeeApiKeySecret,
      userId,
    });
    return {
      enabled: true,
      userId,
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      mode: config.stringeeFromNumber ? 'app-to-phone' : 'app-to-app',
      fromNumber: config.stringeeFromNumber || null,
      projectId: config.stringeeProjectId || null,
      peers: peers.map((peer) => ({ ...peer, stringeeUserId: stringeeIdentity(peer.id) })),
    };
  });

  app.get('/api/v1/telephony/calls', async (request) => {
    const current = request.user!;
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
    const calls = await prisma.telephonyCall.findMany({
      where: { orgId: current.orgId, ownerUserId: current.id },
      include: { peerUser: { select: { id: true, fullName: true, avatarUrl: true } } },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return { calls };
  });

  app.post('/api/v1/telephony/calls', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!ensureConfigured(reply)) return;
    const current = request.user!;
    const body = request.body as { peerUserId?: string; direction?: string; providerCallId?: string };
    if (!body.peerUserId || !body.direction || !DIRECTIONS.has(body.direction)) {
      return reply.status(400).send({ error: 'peerUserId hoặc direction không hợp lệ' });
    }
    const peer = await prisma.user.findFirst({
      where: { id: body.peerUserId, orgId: current.orgId, isActive: true },
      select: { id: true },
    });
    if (!peer || peer.id === current.id) return reply.status(404).send({ error: 'Không tìm thấy nhân viên nhận cuộc gọi' });
    const ownIdentity = stringeeIdentity(current.id);
    const peerIdentity = stringeeIdentity(peer.id);
    const call = await prisma.telephonyCall.create({
      data: {
        orgId: current.orgId,
        ownerUserId: current.id,
        peerUserId: peer.id,
        providerCallId: body.providerCallId || null,
        direction: body.direction,
        status: body.direction === 'inbound' ? 'ringing' : 'initiated',
        fromIdentity: body.direction === 'inbound' ? peerIdentity : ownIdentity,
        toIdentity: body.direction === 'inbound' ? ownIdentity : peerIdentity,
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
