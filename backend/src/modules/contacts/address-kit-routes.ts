// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * address-kit-routes.ts — proxy cho frontend gọi danh sách tỉnh/thành + phường/xã
 * chính thức (mô hình 2 cấp). Logic fetch/cache thật nằm ở
 * ../../shared/address-kit-client.ts (dùng chung với contact-import-service và
 * script backfill — tránh gọi HTTP nội bộ vào chính route này).
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { logger } from '../../shared/utils/logger.js';
import { fetchProvinces, fetchWards } from '../../shared/address-kit-client.js';

const ONE_YEAR_SECONDS = 31536000;

export async function addressKitRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/api/v1/address/provinces', async (_request, reply) => {
    try {
      const provinces = await fetchProvinces();
      reply.header('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
      return { provinces };
    } catch (err) {
      logger.warn('[address-kit] fetch provinces failed:', err);
      return reply.status(502).send({ error: 'Không tải được danh sách tỉnh/thành' });
    }
  });

  app.get<{ Params: { code: string } }>('/api/v1/address/provinces/:code/wards', async (request, reply) => {
    const { code } = request.params;
    if (!/^\d+$/.test(code)) {
      return reply.status(400).send({ error: 'Mã tỉnh không hợp lệ' });
    }
    try {
      const wards = await fetchWards(code);
      reply.header('Cache-Control', `public, max-age=${ONE_YEAR_SECONDS}, immutable`);
      return { wards };
    } catch (err) {
      logger.warn(`[address-kit] fetch wards failed (province=${code}):`, err);
      return reply.status(502).send({ error: 'Không tải được danh sách phường/xã' });
    }
  });
}
