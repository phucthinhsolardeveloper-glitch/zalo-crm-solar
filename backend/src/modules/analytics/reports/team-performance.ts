// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * team-performance.ts — Per-user metrics: messages sent, contacts converted,
 * appointments completed, avg response time.
 */
import { prisma } from '../../../shared/database/prisma-client.js';

export interface TeamMember {
  userId: string;
  fullName: string;
  messagesSent: number;
  contactsConverted: number;
  appointmentsCompleted: number;
  avgResponseTime: number | null; // seconds
  // Call metrics — reuses TelephonyCall (existing calling system), not a separate stats table.
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  totalCallDurationSec: number;
  avgCallDurationSec: number | null;
}

export interface TeamPerformanceResult {
  users: TeamMember[];
}

export async function getTeamPerformance(
  orgId: string,
  from: string,
  to: string,
): Promise<TeamPerformanceResult> {
  const gte = new Date(from);
  const lt = new Date(to);
  lt.setDate(lt.getDate() + 1);

  // Get all active users in org
  const orgUsers = await prisma.user.findMany({
    where: { orgId, isActive: true },
    select: { id: true, fullName: true },
  });

  if (!orgUsers.length) return { users: [] };

  const userIds = orgUsers.map((u) => u.id);

  // Parallel queries
  const [msgRows, convertedRows, aptRows, rtRows, callStatusRows, callDurationRows] = await Promise.all([
    // Messages sent per user (replied_by_user_id)
    prisma.$queryRaw<Array<{ user_id: string; cnt: bigint }>>`
      SELECT m.replied_by_user_id AS user_id, COUNT(*)::bigint AS cnt
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.org_id = ${orgId}
        AND m.sender_type = 'self'
        AND m.replied_by_user_id = ANY(${userIds})
        AND m.sent_at >= ${gte} AND m.sent_at < ${lt}
      GROUP BY m.replied_by_user_id
    `,
    // Contacts converted per user — "converted" = đã tới 1 trong 2 giai đoạn thành công
    // (chốt đơn/đã mua). FIX 2026-08-20: status pipeline đổi sang 10 bước thật, giá trị
    // 'converted' generic cũ không còn ai ghi vào nữa (sẽ luôn trả 0 nếu giữ nguyên).
    prisma.contact.groupBy({
      by: ['assignedUserId'],
      where: {
        orgId,
        status: { in: ['closed_won', 'purchased'] },
        assignedUserId: { in: userIds },
        updatedAt: { gte, lt },
      },
      _count: true,
    }),
    // Appointments completed per user
    prisma.appointment.groupBy({
      by: ['assignedUserId'],
      where: {
        orgId,
        status: 'completed',
        assignedUserId: { in: userIds },
        appointmentDate: { gte, lt },
      },
      _count: true,
    }),
    // Avg response time from DailyMessageStat
    prisma.$queryRaw<Array<{ user_id: string; avg_rt: number | null }>>`
      SELECT user_id, AVG(avg_response_time_seconds)::float AS avg_rt
      FROM daily_message_stats
      WHERE org_id = ${orgId}
        AND user_id = ANY(${userIds})
        AND stat_date >= ${gte}::date AND stat_date < ${lt}::date
        AND avg_response_time_seconds IS NOT NULL
      GROUP BY user_id
    `,
    // Call counts per user + status — total/answered/missed. Reuses TelephonyCall,
    // the same table Call History/softphone already write to (no parallel stats table).
    prisma.telephonyCall.groupBy({
      by: ['ownerUserId', 'status'],
      where: { orgId, ownerUserId: { in: userIds }, startedAt: { gte, lt } },
      _count: true,
    }),
    // Duration only meaningful for calls that actually connected.
    prisma.telephonyCall.groupBy({
      by: ['ownerUserId'],
      where: {
        orgId, ownerUserId: { in: userIds }, startedAt: { gte, lt },
        status: { in: ['completed', 'answered'] },
      },
      _sum: { durationSec: true },
      _avg: { durationSec: true },
    }),
  ]);

  // Build lookup maps
  const msgMap = new Map(msgRows.map((r) => [r.user_id, Number(r.cnt)]));
  const convMap = new Map(
    convertedRows.map((r) => [r.assignedUserId, r._count]),
  );
  const aptMap = new Map(aptRows.map((r) => [r.assignedUserId, r._count]));
  const rtMap = new Map(rtRows.map((r) => [r.user_id, r.avg_rt]));

  const ANSWERED_STATUSES = new Set(['completed', 'answered']);
  const MISSED_STATUSES = new Set(['missed', 'rejected', 'failed']);
  const callCountMap = new Map<string, { total: number; answered: number; missed: number }>();
  for (const row of callStatusRows) {
    const cur = callCountMap.get(row.ownerUserId) ?? { total: 0, answered: 0, missed: 0 };
    cur.total += row._count;
    if (ANSWERED_STATUSES.has(row.status)) cur.answered += row._count;
    if (MISSED_STATUSES.has(row.status)) cur.missed += row._count;
    callCountMap.set(row.ownerUserId, cur);
  }
  const callDurationMap = new Map(callDurationRows.map((r) => [r.ownerUserId, r]));

  const users: TeamMember[] = orgUsers.map((u) => {
    const calls = callCountMap.get(u.id) ?? { total: 0, answered: 0, missed: 0 };
    const duration = callDurationMap.get(u.id);
    return {
      userId: u.id,
      fullName: u.fullName,
      messagesSent: msgMap.get(u.id) ?? 0,
      contactsConverted: convMap.get(u.id) ?? 0,
      appointmentsCompleted: aptMap.get(u.id) ?? 0,
      avgResponseTime: rtMap.get(u.id) ?? null,
      totalCalls: calls.total,
      answeredCalls: calls.answered,
      missedCalls: calls.missed,
      totalCallDurationSec: duration?._sum.durationSec ?? 0,
      avgCallDurationSec: duration?._avg.durationSec ?? null,
    };
  });

  // Sort by contactsConverted desc
  users.sort((a, b) => b.contactsConverted - a.contactsConverted);

  return { users };
}
