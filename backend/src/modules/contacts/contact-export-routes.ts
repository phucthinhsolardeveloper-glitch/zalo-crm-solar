// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * contact-export-routes.ts — Xuất danh sách Contact ra .xlsx/.csv, cùng field/label/enum
 * với contact-import-service.ts (xem contact-export-service.ts) để round-trip được.
 * Hỗ trợ bộ lọc phổ biến nhất của màn Danh sách khách hàng (search/status/source/
 * customerType/assignedUserId) + scope RBAC giống hệt GET /api/v1/contacts.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../shared/database/prisma-client.js';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { getContactScope } from './contact-scope.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { logger } from '../../shared/utils/logger.js';
import { buildContactsCsv, buildContactsXlsx, type ExportableContact } from './contact-export-service.js';

const MAX_EXPORT_ROWS = 20000;

export async function contactExportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/contacts/export', { preHandler: requireGrant('contact', 'access') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user!;
    const q = request.query as {
      format?: string;
      search?: string;
      source?: string;
      status?: string;
      statusId?: string;
      customerType?: string;
      assignedUserId?: string;
      threadType?: string;
      hasZalo?: string;
      relationshipKindAny?: string;
      multiNick?: string;
      scoreMin?: string;
      scoreMax?: string;
      dateFrom?: string;
      dateTo?: string;
    };
    const format = q.format === 'xlsx' ? 'xlsx' : 'csv';

    try {
      const where: any = { orgId: user.orgId, mergedInto: null };
      // Cùng RBAC scope với GET /api/v1/contacts — sale chỉ xuất được KH mình có quyền xem.
      const scope = await getContactScope(user.id, user.orgId, user.role);
      if (!scope.isOrgAdmin && scope.accessibleContactIds !== null) {
        where.id = { in: scope.accessibleContactIds };
      }
      if (q.source) where.source = q.source;
      if (q.status) where.status = q.status;
      if (q.statusId) where.statusId = q.statusId;
      if (q.customerType) where.customerType = q.customerType;
      if (q.assignedUserId) where.assignedUserId = q.assignedUserId;
      if (q.relationshipKindAny) {
        const kinds = q.relationshipKindAny.split(',').map((value) => value.trim()).filter(Boolean);
        if (kinds.length) where.friends = { some: { relationshipKind: { in: kinds } } };
      }
      if (q.scoreMin || q.scoreMax) {
        where.leadScore = {};
        if (q.scoreMin) where.leadScore.gte = Number(q.scoreMin) || 0;
        if (q.scoreMax) where.leadScore.lte = Number(q.scoreMax) || 100;
      }
      if (q.dateFrom || q.dateTo) {
        where.lastActivity = {};
        if (q.dateFrom) where.lastActivity.gte = new Date(q.dateFrom);
        if (q.dateTo) where.lastActivity.lte = new Date(`${q.dateTo}T23:59:59.999Z`);
      }
      if (q.threadType === 'group') {
        where.AND = where.AND ?? [];
        where.AND.push({ conversations: { some: { threadType: 'group', orgId: user.orgId } } });
        where.AND.push({ conversations: { none: { threadType: 'user', orgId: user.orgId } } });
        where.AND.push({ OR: [{ phone: null }, { phone: '' }] });
      } else if (q.threadType === 'user') {
        where.AND = where.AND ?? [];
        where.AND.push({
          NOT: { AND: [
            { conversations: { some: { threadType: 'group', orgId: user.orgId } } },
            { conversations: { none: { threadType: 'user', orgId: user.orgId } } },
            { OR: [{ phone: null }, { phone: '' }] },
          ] },
        });
      }
      if (['true', 'false', 'unknown'].includes(q.hasZalo || '')) {
        const hasIdentityShape = [
          { friends: { some: { zaloAccount: { archivedAt: null }, relationshipKind: { not: 'ghost' } } } },
          { zaloUid: { not: null } },
          { zaloGlobalId: { not: null } },
          { zaloUsername: { not: null } },
        ];
        where.AND = where.AND ?? [];
        if (q.hasZalo === 'true') where.AND.push({ OR: [{ hasZalo: true }, ...hasIdentityShape] });
        else {
          where.AND.push({ NOT: { OR: hasIdentityShape } });
          where.AND.push({ hasZalo: q.hasZalo === 'false' ? false : null });
        }
      }
      if (q.multiNick === 'true') {
        const grouped = await prisma.friend.groupBy({
          by: ['contactId'],
          where: {
            orgId: user.orgId,
            relationshipKind: { not: 'ghost' },
            zaloAccount: { archivedAt: null },
          },
          _count: { contactId: true },
          having: { contactId: { _count: { gte: 2 } } },
        });
        const ids = grouped.map((row) => row.contactId);
        if (where.id?.in) {
          const allowed = new Set(where.id.in as string[]);
          where.id = { in: ids.filter((id) => allowed.has(id)) };
        } else where.id = { in: ids };
      }
      if (q.search) {
        const canonicalPhone = normalizePhone(q.search);
        where.OR = [
          { fullName: { contains: q.search, mode: 'insensitive' } },
          { crmName: { contains: q.search, mode: 'insensitive' } },
          ...(canonicalPhone ? [{ phoneNormalized: { equals: canonicalPhone } }] : []),
          { email: { contains: q.search, mode: 'insensitive' } },
        ];
      }

      const contacts: ExportableContact[] = await prisma.contact.findMany({
        where,
        orderBy: { lastActivity: { sort: 'desc', nulls: 'last' } },
        take: MAX_EXPORT_ROWS,
        select: {
          fullName: true, phone: true, email: true, industry: true, storeName: true,
          customerType: true, importanceLevel: true, province: true, district: true, ward: true, addressLine: true,
          birthDate: true, source: true, status: true,
        },
      });

      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'xlsx') {
        const buf = await buildContactsXlsx(contacts);
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="khach-hang-${stamp}.xlsx"`);
        return reply.send(buf);
      }
      const csv = buildContactsCsv(contacts);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="khach-hang-${stamp}.csv"`);
      return reply.send(csv);
    } catch (err) {
      logger.error('[contact-export] error:', err);
      return reply.status(500).send({ error: 'Không xuất được danh sách khách hàng' });
    }
  });
}
