// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * call-routes.ts — REST API cho CallRecord: timeline theo contact, log thủ công
 * (click-to-call), upload/xoá ghi âm.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { assertContactVisible } from '../contacts/contact-scope.js';
import { scanOrPass } from '../../shared/security/clamav-client.js';
import { logger } from '../../shared/utils/logger.js';
import {
  createManualCall,
  listCallsForContact,
  attachRecording,
  removeRecording,
  getCallRecordContactId,
} from './call-service.js';

const RECORDING_MIME_ALLOWLIST = new Set([
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac',
]);
const RECORDING_MAX_BYTES = 20 * 1024 * 1024;

export async function callRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── GET /api/v1/contacts/:contactId/calls — timeline cuộc gọi của 1 contact ──
  app.get(
    '/api/v1/contacts/:contactId/calls',
    { preHandler: requireGrant('contact', 'access') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { contactId } = request.params as { contactId: string };

      try {
        const visible = await assertContactVisible({
          userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
        });
        if (!visible) return reply.status(403).send({ error: 'Không có quyền xem liên hệ này' });

        const calls = await listCallsForContact(user.orgId, contactId);
        return { calls };
      } catch (err) {
        logger.error('[calls] list calls error:', err);
        return reply.status(500).send({ error: 'Lấy danh sách cuộc gọi thất bại' });
      }
    },
  );

  // ── POST /api/v1/calls — log cuộc gọi thủ công (click-to-call hoặc nhập tay) ──
  app.post(
    '/api/v1/calls',
    { preHandler: requireGrant('contact', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const body = request.body as {
        contactId?: string; friendId?: string | null; zaloAccountId?: string;
        conversationId?: string | null; callType?: string; direction?: string;
        durationSec?: number | null; occurredAt?: string; note?: string | null;
      };

      if (!body?.contactId || !body?.zaloAccountId) {
        return reply.status(400).send({ error: 'contactId và zaloAccountId bắt buộc' });
      }
      if (body.callType !== 'voice' && body.callType !== 'video') {
        return reply.status(400).send({ error: "callType phải là 'voice' hoặc 'video'" });
      }
      if (body.direction !== 'inbound' && body.direction !== 'outbound') {
        return reply.status(400).send({ error: "direction phải là 'inbound' hoặc 'outbound'" });
      }

      try {
        const visible = await assertContactVisible({
          userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId: body.contactId,
        });
        if (!visible) return reply.status(403).send({ error: 'Không có quyền trên liên hệ này' });

        const call = await createManualCall({
          orgId: user.orgId,
          contactId: body.contactId,
          friendId: body.friendId ?? null,
          zaloAccountId: body.zaloAccountId,
          conversationId: body.conversationId ?? null,
          callType: body.callType,
          direction: body.direction,
          durationSec: body.durationSec ?? null,
          occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
          note: body.note ?? null,
          createdByUserId: user.id,
        });
        return reply.status(201).send({ call });
      } catch (err) {
        logger.error('[calls] create manual call error:', err);
        return reply.status(500).send({ error: 'Ghi nhận cuộc gọi thất bại' });
      }
    },
  );

  // ── POST /api/v1/calls/:id/recording — upload file ghi âm (multipart) ──────
  app.post(
    '/api/v1/calls/:id/recording',
    { preHandler: requireGrant('contact', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      try {
        const contactId = await getCallRecordContactId(user.orgId, id);
        if (!contactId) return reply.status(404).send({ error: 'CallRecord không tồn tại' });

        const visible = await assertContactVisible({
          userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
        });
        if (!visible) return reply.status(403).send({ error: 'Không có quyền trên liên hệ này' });

        let buffer: Buffer | null = null;
        let mimeType = '';
        let filename = '';

        for await (const part of request.parts()) {
          if (part.type !== 'file') continue;
          if (!RECORDING_MIME_ALLOWLIST.has(part.mimetype)) {
            return reply.status(415).send({ error: `Định dạng không hỗ trợ: ${part.mimetype}` });
          }
          buffer = await part.toBuffer();
          if (buffer.length > RECORDING_MAX_BYTES) {
            return reply.status(413).send({ error: 'File ghi âm vượt 20MB' });
          }
          mimeType = part.mimetype;
          filename = part.filename;
          break; // chỉ nhận 1 file/request
        }

        if (!buffer) return reply.status(400).send({ error: 'Không có file nào' });

        const av = await scanOrPass(buffer, { filename, userId: user.id });
        if (av.blocked) return reply.status(422).send({ error: av.reason, code: 'AV_BLOCKED' });

        const updated = await attachRecording({
          orgId: user.orgId, callId: id, buffer, mimeType, originalName: filename,
        });
        if (!updated) return reply.status(404).send({ error: 'CallRecord không tồn tại' });
        return { call: updated };
      } catch (err) {
        logger.error('[calls] upload recording error:', err);
        return reply.status(500).send({ error: 'Upload ghi âm thất bại' });
      }
    },
  );

  // ── DELETE /api/v1/calls/:id/recording — gỡ ghi âm (upload nhầm file) ──────
  app.delete(
    '/api/v1/calls/:id/recording',
    { preHandler: requireGrant('contact', 'edit') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      try {
        const contactId = await getCallRecordContactId(user.orgId, id);
        if (!contactId) return reply.status(404).send({ error: 'CallRecord không tồn tại' });

        const visible = await assertContactVisible({
          userId: user.id, orgId: user.orgId, legacyRole: user.role, contactId,
        });
        if (!visible) return reply.status(403).send({ error: 'Không có quyền trên liên hệ này' });

        const updated = await removeRecording(user.orgId, id);
        if (!updated) return reply.status(404).send({ error: 'CallRecord không tồn tại' });
        return { call: updated };
      } catch (err) {
        logger.error('[calls] remove recording error:', err);
        return reply.status(500).send({ error: 'Xoá ghi âm thất bại' });
      }
    },
  );
}
