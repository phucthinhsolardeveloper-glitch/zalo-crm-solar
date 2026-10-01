// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * credential-routes.ts — Export/import Zalo session credentials for backup/restore.
 * Endpoints: POST /accounts/:id/credentials/export, POST /accounts/:id/credentials/import
 * Credentials contain sensitive cookies — access restricted to account admins.
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { decryptZaloSession, encryptZaloSession } from './zalo-session-crypto.js';

/** Shape matching openzca StoredCredentials */
interface StoredCredentials {
  cookie: Record<string, string>;
  imei: string;
  userAgent: string;
}

function isValidCredentials(obj: unknown): obj is StoredCredentials {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.imei === 'string' && c.imei.length > 0 &&
    typeof c.userAgent === 'string' && c.userAgent.length > 0 &&
    typeof c.cookie === 'object' && c.cookie !== null
  );
}

const BASE = '/api/v1/zalo-accounts/:accountId/credentials';

type AuthUser = { id: string; orgId: string; role: string };

async function writeCredentialAudit(
  user: AuthUser,
  accountId: string,
  action: 'zalo_credentials_export' | 'zalo_credentials_import',
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
        details: { accountId, result: 'success' },
      },
    });
  } catch (err) {
    // Credential operations must remain usable if audit storage is temporarily unavailable,
    // but the failure is visible to operators and never contains credential material.
    logger.warn(`[credential-routes] audit write failed action=${action} account=${accountId}:`, err);
  }
}

async function requireCredentialAdmin(accountId: string, user: AuthUser) {
  const account = await prisma.zaloAccount.findFirst({
    where: { id: accountId, orgId: user.orgId },
    select: { id: true, sessionData: true, displayName: true },
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

export async function credentialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // POST .../credentials/export — download session credentials as JSON.
  // Account-admin authorization, audit and rate-limit keep this fast without
  // forcing an unnecessary CRM password prompt on every operational backup.
  app.post(`${BASE}/export`, {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const user = request.user!;

    const access = await requireCredentialAdmin(accountId, user);
    if ('error' in access) {
      return reply.status(access.error === 'not_found' ? 404 : 403).send({
        error: access.error === 'not_found' ? 'Account not found' : 'Admin permission required to export credentials',
      });
    }
    const { account } = access;

    const credentials = decryptZaloSession(account.sessionData);
    if (!credentials) {
      return reply.status(404).send({ error: 'No credentials saved for this account' });
    }

    const filename = `zalo-credentials-${account.displayName ?? accountId}-${Date.now()}.json`;
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    await writeCredentialAudit(user, accountId, 'zalo_credentials_export');
    logger.info(`[credential-routes] Exporting credentials for account ${accountId}`);
    return reply.send(JSON.stringify(credentials, null, 2));
  });

  // Keep old clients from silently downloading a session without re-auth.
  app.get(`${BASE}/export`, async (_request, reply) =>
    reply.status(405).send({ error: 'Credential export requires the authenticated POST action' }),
  );

  // POST .../credentials/import — restore credentials from uploaded JSON
  app.post<{ Body: unknown }>(`${BASE}/import`, {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const user = request.user!;

    const access = await requireCredentialAdmin(accountId, user);
    if ('error' in access) {
      return reply.status(access.error === 'not_found' ? 404 : 403).send({
        error: access.error === 'not_found' ? 'Account not found' : 'Admin permission required to import credentials',
      });
    }

    const body = (request.body && typeof request.body === 'object')
      ? { ...(request.body as Record<string, unknown>) }
      : {};
    let credentials;
    try {
      credentials = decryptZaloSession(body);
    } catch {
      credentials = null;
    }
    if (!credentials || !isValidCredentials(credentials)) {
      return reply.status(400).send({
        error: 'Invalid credential format. Expected: { cookie: object, imei: string, userAgent: string }',
      });
    }

    try {
      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          sessionData: encryptZaloSession(credentials) as any,
          status: 'disconnected',
        },
      });

      await writeCredentialAudit(user, accountId, 'zalo_credentials_import');
      logger.info(`[credential-routes] Credentials imported for account ${accountId}`);
      return { success: true, message: 'Credentials imported. Use reconnect to activate.' };
    } catch (err) {
      logger.error(`[credential-routes] Import failed for account ${accountId}:`, err);
      return reply.status(500).send({ error: 'Failed to save credentials' });
    }
  });
}
