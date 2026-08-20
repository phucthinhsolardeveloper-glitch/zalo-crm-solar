// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * conversion-funnel.ts — Pipeline conversion rates: count per stage + conversion %.
 */
import { prisma } from '../../../shared/database/prisma-client.js';

export interface FunnelStage {
  status: string;
  count: number;
  rate: number; // % of total contacts that reached this stage
}

export interface ConversionFunnelResult {
  stages: FunnelStage[];
  totalContacts: number;
  avgConversionDays: number | null; // avg days from creation to "converted"
}

// FIX 2026-08-20: STAGE_ORDER phải khớp đúng pipeline thật (use-contacts.ts STATUS_OPTIONS,
// đổi từ placeholder generic 5 bước sang 10 bước thật của công ty audit trước đó) — giữ
// nguyên list cũ ở đây sẽ khiến funnel hiện toàn 0 cho MỌI contact mới vì status thật không
// còn khớp 'converted'/'interested' generic nữa.
const STAGE_ORDER = [
  'new', 'contacted', 'interested', 'quoted', 'following',
  'closed_won', 'not_potential', 'transferred', 'purchased', 'discontinued',
];
// "Converted" cho mục đích funnel = đã tới 1 trong 2 giai đoạn thành công (chốt đơn/đã mua).
const CONVERTED_STATUSES = ['closed_won', 'purchased'];

export async function getConversionFunnel(
  orgId: string,
  from: string,
  to: string,
): Promise<ConversionFunnelResult> {
  const gte = new Date(from);
  const lt = new Date(to);
  lt.setDate(lt.getDate() + 1);

  const groups = await prisma.contact.groupBy({
    by: ['status'],
    where: { orgId, createdAt: { gte, lt }, status: { not: null } },
    _count: true,
  });

  const countMap: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    const s = g.status ?? 'unknown';
    countMap[s] = g._count;
    total += g._count;
  }

  const stages: FunnelStage[] = STAGE_ORDER.map((status) => ({
    status,
    count: countMap[status] ?? 0,
    rate: total > 0 ? Math.round(((countMap[status] ?? 0) / total) * 1000) / 10 : 0,
  }));

  // Avg days from createdAt to updatedAt for converted contacts
  const avgResult = await prisma.$queryRaw<[{ avg_days: number | null }]>`
    SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)::float AS avg_days
    FROM contacts
    WHERE org_id = ${orgId}
      AND status = ANY(${CONVERTED_STATUSES})
      AND created_at >= ${gte}
      AND created_at < ${lt}
  `;

  const avgDays = avgResult[0]?.avg_days;

  return {
    stages,
    totalContacts: total,
    avgConversionDays: avgDays ? Math.round(avgDays * 10) / 10 : null,
  };
}
