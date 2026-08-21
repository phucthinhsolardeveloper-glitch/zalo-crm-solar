// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * contact-import-routes.ts — Import Contact từ xlsx/xls/csv (Upload → Column
 * Mapping → Preview → Validation → Duplicate Detection → Import → Result).
 * Frontend parse file (exceljs, giống CreateListModal.vue) + map cột, gửi rows
 * đã map lên đây — backend không tự đọc file, chỉ nhận rows đã cấu trúc.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { requireGrant } from '../rbac/rbac-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { previewContactImport, commitContactImport } from './contact-import-service.js';
import type { ContactImportRow } from './contact-import-types.js';

const MAX_ROWS = 5000;

function normalizeRows(body: unknown): ContactImportRow[] | null {
  const rows = (body as { rows?: unknown[] })?.rows;
  if (!Array.isArray(rows)) return null;
  if (rows.length === 0 || rows.length > MAX_ROWS) return null;
  return rows.map((r, i) => {
    const row = (r ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (v == null ? null : String(v).trim() || null);
    return {
      rowIndex: i + 1,
      fullName: str(row.fullName),
      phone: str(row.phone),
      email: str(row.email),
      industry: str(row.industry),
      storeName: str(row.storeName),
      customerType: str(row.customerType),
      importanceLevel: str(row.importanceLevel),
      province: str(row.province),
      district: str(row.district),
      ward: str(row.ward),
      addressLine: str(row.addressLine),
      birthDate: str(row.birthDate),
      source: str(row.source),
      contactStatus: str(row.status),
    };
  });
}

export async function contactImportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post('/api/v1/contacts/import/preview', { preHandler: requireGrant('contact', 'create') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const rows = normalizeRows(request.body);
    if (!rows) return reply.status(400).send({ error: `Cần "rows" (mảng), tối đa ${MAX_ROWS} dòng mỗi lần` });
    const user = request.user!;
    try {
      const result = await previewContactImport(rows, user.orgId);
      return result;
    } catch (err) {
      logger.error('[contact-import] Preview error:', err);
      return reply.status(500).send({ error: 'Không xử lý được file import' });
    }
  });

  app.post('/api/v1/contacts/import/commit', { preHandler: requireGrant('contact', 'create') }, async (request: FastifyRequest, reply: FastifyReply) => {
    const rows = normalizeRows(request.body);
    if (!rows) return reply.status(400).send({ error: `Cần "rows" (mảng), tối đa ${MAX_ROWS} dòng mỗi lần` });
    const user = request.user!;
    try {
      const result = await commitContactImport(rows, user.orgId, user.id);
      return result;
    } catch (err) {
      logger.error('[contact-import] Commit error:', err);
      return reply.status(500).send({ error: 'Import thất bại' });
    }
  });
}
