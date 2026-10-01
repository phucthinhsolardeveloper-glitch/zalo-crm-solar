// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * broadcast-routes.ts — Mục C (2026-09-30): tạo/điều khiển gửi hàng loạt từ
 * nick cá nhân (AutomationBroadcast, channel='zalo_user'). Phase 1: chỉ nhận
 * segmentSpec={contactIds} cố định (không filter động), 1 broadcast = 1 Block
 * = 1 nick (qua Block.ownerNickId). Xem plan + broadcast-worker.ts cho các
 * cổng an toàn (không gửi cho người chưa kết bạn, quota riêng, kill switch).
 * Phase 3a (2026-10-01): hỗ trợ thêm ảnh/album qua `attachmentAssetIds`
 * (ID từ Kho media /api/v1/media, server tự tra URL thật — xem CreateBody).
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { enqueueBroadcastTick } from './broadcast-queue.js';

const BASE = '/api/v1/broadcasts';

const MAX_ATTACHMENTS = 12; // khớp giới hạn album send-block (chat-routes.ts)

interface CreateBody {
  name?: unknown;
  nickId?: unknown;
  messageText?: unknown;
  contactIds?: unknown;
  batchSize?: unknown;
  intervalSec?: unknown;
  scheduledAt?: unknown;
  // Mục C Phase 3a (2026-10-01): ID ảnh từ Kho media (/api/v1/media) của CHÍNH
  // org — KHÔNG nhận URL trực tiếp từ client (chặn SSRF/IDOR), server tự tra
  // lại publicUrl thật từ MediaAsset bên dưới.
  attachmentAssetIds?: unknown;
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
    const batchSize = Number(body.batchSize ?? 5);
    const intervalSec = Number(body.intervalSec ?? 60);
    const scheduledAt = typeof body.scheduledAt === 'string' && body.scheduledAt.trim()
      ? new Date(body.scheduledAt)
      : null;
    const attachmentAssetIds = Array.isArray(body.attachmentAssetIds)
      ? [...new Set(body.attachmentAssetIds.filter((v): v is string => typeof v === 'string' && v.length > 0))]
      : [];

    if (!name) return reply.status(400).send({ error: 'name_required' });
    if (!messageText && attachmentAssetIds.length === 0)
      return reply.status(400).send({ error: 'message_text_or_attachment_required' });
    if (attachmentAssetIds.length > MAX_ATTACHMENTS)
      return reply.status(400).send({ error: 'too_many_attachments', hint: `Tối đa ${MAX_ATTACHMENTS} ảnh/chiến dịch` });
    if (contactIds.length === 0) return reply.status(400).send({ error: 'contact_ids_required' });
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50)
      return reply.status(400).send({ error: 'batch_size_invalid', hint: 'batchSize phải từ 1 đến 50' });
    if (!Number.isInteger(intervalSec) || intervalSec < 30 || intervalSec > 86_400)
      return reply.status(400).send({ error: 'interval_invalid', hint: 'intervalSec phải từ 30 đến 86400 giây' });
    if (scheduledAt && Number.isNaN(scheduledAt.getTime()))
      return reply.status(400).send({ error: 'scheduled_at_invalid' });

    const nick = await prisma.zaloAccount.findFirst({ where: { id: nickId, orgId: user.orgId, archivedAt: null } });
    if (!nick) return reply.status(400).send({ error: 'nick_not_found' });

    // Chỉ chấp nhận contact thuộc org — chặn IDOR nếu FE gửi nhầm/cố tình ID org khác.
    const validContacts = await prisma.contact.findMany({
      where: { id: { in: contactIds }, orgId: user.orgId },
      select: { id: true },
    });
    const validIds = validContacts.map((c) => c.id);
    if (validIds.length === 0) return reply.status(400).send({ error: 'no_valid_contacts' });

    // Tra lại URL THẬT từ Kho media (org-scoped, chỉ ảnh, chưa xoá) — không tin
    // URL do client gửi lên (chặn SSRF/IDOR, xem comment CreateBody).
    let attachments: Array<{ kind: 'image'; url: string; mediaAssetId: string }> = [];
    if (attachmentAssetIds.length > 0) {
      const assets = await prisma.mediaAsset.findMany({
        where: { id: { in: attachmentAssetIds }, orgId: user.orgId, kind: 'image', archivedAt: null },
        include: { blobs: { where: { variantType: 'original' } } },
      });
      attachments = assets
        .map((a) => ({ kind: 'image' as const, url: a.blobs[0]?.publicUrl ?? '', mediaAssetId: a.id }))
        .filter((a) => a.url);
      if (attachments.length === 0) return reply.status(400).send({ error: 'no_valid_attachments' });
    }

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
          content: {
            text: messageText,
            ...(attachments.length > 0 ? { attachments, albumImages: attachments.length > 1 } : {}),
          },
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
          scheduleKind: scheduledAt ? 'scheduled' : 'now',
          scheduledAt,
          pacing: { batchSize, intervalSec },
          state: 'draft',
          totalRecipients: validIds.length,
          createdById: user.id,
        },
      }),
    ]);

    logger.info(`[broadcast-routes] created broadcast=${broadcastId} nick=${nickId} recipients=${validIds.length} skipped_invalid=${contactIds.length - validIds.length} attachments=${attachments.length}`);
    return reply.status(201).send({
      id: broadcastId,
      totalRecipients: validIds.length,
      skippedInvalidContactIds: contactIds.length - validIds.length,
      attachmentCount: attachments.length,
      batchSize,
      intervalSec,
      scheduledAt,
    });
  });

  app.post<{ Params: { id: string } }>(`${BASE}/:id/start`, { preHandler: requireGrant('broadcast', 'edit') }, async (request, reply) => {
    const user = request.user!;
    const broadcast = await prisma.automationBroadcast.findFirst({ where: { id: request.params.id, orgId: user.orgId } });
    if (!broadcast) return reply.status(404).send({ error: 'Không tìm thấy chiến dịch' });
    if (broadcast.state !== 'draft' && broadcast.state !== 'paused') {
      return reply.status(409).send({ error: 'invalid_state', message: `Chiến dịch đang ở trạng thái "${broadcast.state}", không thể start` });
    }
    const delayMs = broadcast.scheduledAt
      ? Math.max(0, broadcast.scheduledAt.getTime() - Date.now())
      : 0;
    // FIX (phát hiện lúc rà soát 2026-10-01): trước đây set state='running'
    // ngay cả khi còn phải chờ tới giờ hẹn — giao diện hiện "Đang gửi" dù
    // chưa gửi tin nào, startedAt cũng ghi sai thời điểm (lúc bấm, không phải
    // lúc thật sự bắt đầu). Nay dùng đúng trạng thái 'scheduled' khi delayMs>0;
    // worker (processBroadcastTick) tự chuyển sang 'running' ở tick đầu tiên
    // khi BullMQ job thật sự chạy (xem broadcast-worker.ts).
    const initialState = delayMs > 0 ? 'scheduled' : 'running';
    await prisma.automationBroadcast.update({
      where: { id: broadcast.id },
      data: {
        state: initialState,
        startedAt: initialState === 'running' ? (broadcast.startedAt ?? new Date()) : broadcast.startedAt,
      },
    });
    await enqueueBroadcastTick(broadcast.id, delayMs);
    return { success: true, state: initialState, delayMs };
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
