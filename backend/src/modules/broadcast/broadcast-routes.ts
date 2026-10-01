// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * broadcast-routes.ts — Mục C (2026-09-30): tạo/điều khiển gửi hàng loạt từ
 * nick cá nhân (AutomationBroadcast, channel='zalo_user'). Phase 1: chỉ nhận
 * segmentSpec={contactIds} cố định (không filter động), 1 broadcast = 1 Block
 * = 1 nick (qua Block.ownerNickId). Xem plan + broadcast-worker.ts cho các
 * cổng an toàn (không gửi cho người chưa kết bạn, quota riêng, kill switch).
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { enqueueBroadcastTick } from './broadcast-queue.js';

const BASE = '/api/v1/broadcasts';

interface CreateBody {
  name?: unknown;
  nickId?: unknown;
  messageText?: unknown;
  contactIds?: unknown;
}

export async function broadcastRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get(BASE, { preHandler: requireGrant('broadcast', 'access') }, async (request) => {
    const user = request.user!;
    return prisma.automationBroadcast.findMany({
      where: { orgId: user.orgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  app.get<{ Params: { id: string } }>(`${BASE}/:id`, { preHandler: requireGrant('broadcast', 'access') }, async (request, reply) => {
    const user = request.user!;
    const broadcast = await prisma.automationBroadcast.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
    });
    if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
    return broadcast;
  });

  // POST /broadcasts — tạo broadcast + Block con trỏ tới (giữ FK schema, nội
  // dung đọc trực tiếp bởi broadcast-worker, KHÔNG qua resolveBlockContent).
  app.post<{ Body: CreateBody }>(BASE, { preHandler: requireGrant('broadcast', 'create') }, async (request, reply) => {
    const user = request.user!;
    const body = request.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const nickId = typeof body.nickId === 'string' ? body.nickId : '';
    const messageText = typeof body.messageText === 'string' ? body.messageText.trim() : '';
    const contactIds = Array.isArray(body.contactIds)
      ? [...new Set(body.contactIds.filter((v): v is string => typeof v === 'string' && v.length > 0))]
      : [];

    if (!name) return reply.status(400).send({ error: 'name_required' });
    if (!messageText) return reply.status(400).send({ error: 'message_text_required' });
    if (contactIds.length === 0) return reply.status(400).send({ error: 'contact_ids_required' });

    const nick = await prisma.zaloAccount.findFirst({ where: { id: nickId, orgId: user.orgId, archivedAt: null } });
    if (!nick) return reply.status(400).send({ error: 'nick_not_found' });

    // Chỉ chấp nhận contact thuộc org — chặn IDOR nếu FE gửi nhầm/cố tình ID org khác.
    const validContacts = await prisma.contact.findMany({
      where: { id: { in: contactIds }, orgId: user.orgId },
      select: { id: true },
    });
    const validIds = validContacts.map((c) => c.id);
    if (validIds.length === 0) return reply.status(400).send({ error: 'no_valid_contacts' });

    const blockId = randomUUID();
    const broadcastId = randomUUID();
    await prisma.$transaction([
      prisma.block.create({
        data: {
          id: blockId,
          orgId: user.orgId,
          name: `[Broadcast] ${name}`,
          channel: 'zalo_user',
          actionType: 'send_message',
          content: { text: messageText },
          ownerNickId: nickId,
          isShared: false,
          createdById: user.id,
        },
      }),
      prisma.automationBroadcast.create({
        data: {
          id: broadcastId,
          orgId: user.orgId,
          name,
          channel: 'zalo_user',
          blockId,
          segmentSpec: { contactIds: validIds },
          scheduleKind: 'now',
          state: 'draft',
          totalRecipients: validIds.length,
          createdById: user.id,
        },
      }),
    ]);

    logger.info(`[broadcast-routes] created broadcast=${broadcastId} nick=${nickId} recipients=${validIds.length} skipped_invalid=${contactIds.length - validIds.length}`);
    return reply.status(201).send({ id: broadcastId, totalRecipients: validIds.length, skippedInvalidContactIds: contactIds.length - validIds.length });
  });

  app.post<{ Params: { id: string } }>(`${BASE}/:id/start`, { preHandler: requireGrant('broadcast', 'edit') }, async (request, reply) => {
    const user = request.user!;
    const broadcast = await prisma.automationBroadcast.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
    if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
    if (broadcast.state !== 'draft' && broadcast.state !== 'paused') {
      return reply.status(409).send({ error: 'invalid_state', message: `Chiến dịch đang ở trạng thái "${broadcast.state}", không thể start` });
    }
    await prisma.automationBroadcast.update({
      where: { id: broadcast.id },
      data: { state: 'running', startedAt: broadcast.startedAt ?? new Date() },
    });
    await enqueueBroadcastTick(broadcast.id);
    return { success: true, state: 'running' };
  });

  app.post<{ Params: { id: string } }>(`${BASE}/:id/pause`, { preHandler: requireGrant('broadcast', 'edit') }, async (request, reply) => {
    const user = request.user!;
    const broadcast = await prisma.automationBroadcast.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
    if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
    await prisma.automationBroadcast.update({ where: { id: broadcast.id }, data: { state: 'paused' } });
    return { success: true, state: 'paused' };
  });

  app.post<{ Params: { id: string } }>(`${BASE}/:id/cancel`, { preHandler: requireGrant('broadcast', 'edit') }, async (request, reply) => {
    const user = request.user!;
    const broadcast = await prisma.automationBroadcast.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
    if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
    await prisma.automationBroadcast.update({ where: { id: broadcast.id }, data: { state: 'cancelled', completedAt: new Date() } });
    return { success: true, state: 'cancelled' };
  });
}
