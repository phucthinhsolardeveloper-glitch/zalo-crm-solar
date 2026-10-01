// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * zalo-kill-switch-routes.ts — admin-only pause/resume outbound per nick.
 * Endpoints: POST /accounts/:id/pause-sending, POST /accounts/:id/resume-sending
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { pauseSending, resumeSending } from './zalo-kill-switch.js';

const BASE = '/api/v1/zalo-accounts/:accountId';

type AuthUser = { id: string; orgId: string; role: string };
type PauseBody = { reason?: unknown };

async function requireAccountAdmin(accountId: string, user: AuthUser) {
  const account = await prisma.zaloAccount.findFirst({
    where: { id: accountId, orgId: user.orgId },
    select: { id: true, displayName: true, sendingPausedAt: true, sendingPausedReason: true },
  });
  if (!account) return { error: 'not_found' as const };

  if (!['owner', 'admin'].includes(user.role)) {
    const access = await prisma.zaloAccountAccess.findFirst({
      where: { zaloAccountId: accountId, userId: user.id },
    });
    if (!access || access.permission !== 'admin') return { error: 'forbidden' as const };
  }

  return { account };
}

async function writeAuditLog(
  user: AuthUser,
  accountId: string,
  action: 'zalo_sending_paused' | 'zalo_sending_resumed',
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        orgId: user.orgId,
        userId: user.id,
        actorType: 'user',
        category: 'security',
        action,
        entityType: 'zalo_account',
        entityId: accountId,
        details,
      },
    });
  } catch (err) {
    logger.warn(`[kill-switch] audit write failed action=${action} account=${accountId}:`, err);
  }
}

export async function zaloKillSwitchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.post<{ Params: { accountId: string }; Body: PauseBody }>(`${BASE}/pause-sending`, async (request, reply) => {
    const { accountId } = request.params;
    const user = request.user!;

    const access = await requireAccountAdmin(accountId, user);
    if ('error' in access) {
      return reply.status(access.error === 'not_found' ? 404 : 403).send({
        error: access.error === 'not_found' ? 'Account not found' : 'Cần quyền admin để tạm dừng gửi',
      });
    }

    const reason = typeof request.body?.reason === 'string' && request.body.reason.trim()
      ? request.body.reason.trim().slice(0, 500)
      : 'Không rõ lý do (admin bấm tạm dừng)';

    await pauseSending(accountId, reason, user.id);
    await writeAuditLog(user, accountId, 'zalo_sending_paused', { reason });
    logger.warn(`[kill-switch] account=${accountId} paused by user=${user.id} reason="${reason}"`);

    return { success: true, sendingPaused: true, reason };
  });

  app.post<{ Params: { accountId: string } }>(`${BASE}/resume-sending`, async (request, reply) => {
    const { accountId } = request.params;
    const user = request.user!;

    const access = await requireAccountAdmin(accountId, user);
    if ('error' in access) {
      return reply.status(access.error === 'not_found' ? 404 : 403).send({
        error: access.error === 'not_found' ? 'Account not found' : 'Cần quyền admin để mở lại gửi',
      });
    }

    await resumeSending(accountId);
    await writeAuditLog(user, accountId, 'zalo_sending_resumed', {});
    logger.info(`[kill-switch] account=${accountId} resumed by user=${user.id}`);

    return { success: true, sendingPaused: false };
  });
}
