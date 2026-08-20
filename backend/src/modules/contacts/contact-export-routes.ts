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
      customerType?: string;
      assignedUserId?: string;
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
      if (q.customerType) where.customerType = q.customerType;
      if (q.assignedUserId) where.assignedUserId = q.assignedUserId;
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
          customerType: true, province: true, district: true, ward: true, addressLine: true,
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
