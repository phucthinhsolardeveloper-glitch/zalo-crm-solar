// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * broadcast-worker.ts — Mục C (2026-09-30): xử lý 1 chunk của
 * AutomationBroadcast (gửi hàng loạt từ nick cá nhân, trong giới hạn).
 *
 * State machine: draft → running → (paused | completed).
 * Mỗi tick xử lý tối đa CHUNK_SIZE contact rồi tự dừng (queue enqueue lại tick
 * kế tiếp có delay — xem broadcast-queue.ts) — vừa tạo pacing tự nhiên, vừa
 * tránh giữ 1 job chạy liên tục lâu.
 *
 * CỔNG AN TOÀN bắt buộc, không được bỏ qua khi sửa file này:
 *   1. Chỉ gửi cho contact ĐÃ kết bạn (friendshipStatus='accepted') HOẶC đã
 *      từng nhắn qua lại (relationshipKind='chatting_stranger') với đúng nick
 *      (Block.ownerNickId) — H-2 trong roadmap. KHÔNG bao giờ gửi cho người
 *      hoàn toàn chưa từng liên hệ (relationshipKind='none'/'ghost').
 *   2. Bỏ qua contact đã revoke consent.
 *   3. Gửi qua zaloOps.sendCampaignMessage() — category 'campaign_message',
 *      KHÔNG dùng sendMessage() (category 'message' dùng chung với tin trả
 *      lời khách thật).
 *   4. Hết quota → PAUSE broadcast (không phải fail), cần người bấm Resume.
 *   5. Kill switch (ZaloAccount.sendingPausedAt) tự động chặn — không cần code
 *      thêm ở đây, đã nằm trong zaloOps.exec().
 *
 * Nội dung Block đọc qua resolveBlockContent() (ee-registry seam) — Community
 * đã đăng ký bản thật (xem shared/block-content-resolver.ts, app.ts boot).
 * Phase 1 chỉ hỗ trợ Block loại text đơn giản (1 phần text) — Block nhiều
 * thành phần (ảnh/video/file) chưa gửi được từ broadcast, pause + báo lỗi rõ
 * thay vì gửi thiếu.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { resolveBlockContent } from '../../shared/ee-registry/automation.js';

export const BROADCAST_CHUNK_SIZE = 10;

interface SegmentSpec { contactIds: string[] }

interface WorkerStats {
  skipped?: Array<{ contactId: string; reason: string; at: string }>;
  lastError?: string | null;
  lastTickAt?: string;
}

/** Phase 1: chỉ hỗ trợ Block có ĐÚNG 1 phần text. Trả null nếu Block rỗng,
 * không resolve được, hoặc có thành phần media (chưa hỗ trợ gửi hàng loạt). */
function extractPlainText(content: unknown): string | null {
  const result = resolveBlockContent('send_message', (content as Record<string, unknown>) ?? {});
  if (!result.ok || result.resolved.length !== 1) return null;
  const only = result.resolved[0];
  return only.messageType === 'text' ? only.payload.text : null;
}

export interface TickResult {
  state: 'running' | 'paused' | 'completed';
  processed: number;
}

export async function processBroadcastTick(broadcastId: string): Promise<TickResult> {
  const broadcast = await prisma.automationBroadcast.findUnique({
    where: { id: broadcastId },
    include: { org: { select: { id: true } } },
  });
  if (!broadcast) {
    logger.warn(`[broadcast-worker] broadcast ${broadcastId} not found — skip`);
    return { state: 'completed', processed: 0 };
  }
  if (broadcast.state !== 'running') {
    logger.info(`[broadcast-worker] broadcast ${broadcastId} state=${broadcast.state} — skip tick`);
    return { state: broadcast.state as TickResult['state'], processed: 0 };
  }

  const block = await prisma.block.findUnique({ where: { id: broadcast.blockId } });
  if (!block || !block.ownerNickId) {
    await pauseWithError(broadcastId, 'block_missing_or_no_owner_nick');
    return { state: 'paused', processed: 0 };
  }
  const messageText = extractPlainText(block.content);
  if (!messageText) {
    await pauseWithError(broadcastId, 'block_content_empty');
    return { state: 'paused', processed: 0 };
  }
  const nickId = block.ownerNickId;

  if (zaloPool.getStatus(nickId) !== 'connected') {
    await pauseWithError(broadcastId, 'nick_not_connected');
    return { state: 'paused', processed: 0 };
  }

  const segment = broadcast.segmentSpec as unknown as SegmentSpec;
  const contactIds = Array.isArray(segment?.contactIds) ? segment.contactIds : [];
  const stats: WorkerStats = (broadcast.workerStats as WorkerStats | null) ?? {};
  const skipped = stats.skipped ?? [];

  let startIdx = 0;
  if (broadcast.resumeCursor) {
    const idx = contactIds.indexOf(broadcast.resumeCursor);
    if (idx >= 0) startIdx = idx + 1;
  }

  if (startIdx >= contactIds.length) {
    await prisma.automationBroadcast.update({
      where: { id: broadcastId },
      data: { state: 'completed', completedAt: new Date() },
    });
    return { state: 'completed', processed: 0 };
  }

  const chunk = contactIds.slice(startIdx, startIdx + BROADCAST_CHUNK_SIZE);
  let processed = 0;
  let sentDelta = 0;
  let failedDelta = 0;
  let lastCursor = broadcast.resumeCursor;
  let pausedReason: string | null = null;

  for (const contactId of chunk) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, consentStatus: true },
    });
    if (!contact) {
      skipped.push({ contactId, reason: 'contact_not_found', at: new Date().toISOString() });
      lastCursor = contactId; processed++;
      continue;
    }
    if (contact.consentStatus === 'revoked') {
      skipped.push({ contactId, reason: 'consent_revoked', at: new Date().toISOString() });
      lastCursor = contactId; processed++;
      continue;
    }

    // Cổng an toàn #1 (2026-09-30, mở rộng theo quyết định user) — chỉ gửi cho
    // người ĐÃ kết bạn (friendshipStatus='accepted') HOẶC đã từng nhắn qua lại
    // (relationshipKind='chatting_stranger', dùng chung cơ chế "nhắn người lạ"
    // đã có sẵn cho chat 1-1 — không mở cửa cho SĐT hoàn toàn chưa liên hệ, vẫn
    // chặn đúng risk cao nhất là spam người lạ tuyệt đối).
    // threadId của thread 1-1 (threadType=0) = UID người nhận NHÌN TỪ NICK NÀY.
    const friend = await prisma.friend.findFirst({
      where: {
        zaloAccountId: nickId,
        contactId,
        OR: [{ friendshipStatus: 'accepted' }, { relationshipKind: 'chatting_stranger' }],
      },
      select: { zaloUidInNick: true },
    });
    if (!friend?.zaloUidInNick) {
      skipped.push({ contactId, reason: 'not_friend_or_stranger_chat', at: new Date().toISOString() });
      lastCursor = contactId; processed++;
      continue;
    }
    const threadId = friend.zaloUidInNick;

    try {
      await zaloOps.sendCampaignMessage(nickId, threadId, 0, { msg: messageText });
      sentDelta++;
    } catch (err) {
      if (err instanceof ZaloOpError && err.code === 'RATE_LIMITED') {
        // Cổng an toàn #4 — hết quota campaign_message → PAUSE, không fail.
        pausedReason = 'quota_exhausted';
        break;
      }
      if (err instanceof ZaloOpError && err.code === 'SENDING_PAUSED') {
        // Kill switch đang bật cho nick này → dừng broadcast luôn, không thử tiếp.
        pausedReason = 'kill_switch_active';
        break;
      }
      failedDelta++;
      logger.warn(`[broadcast-worker:${broadcastId}] send failed contact=${contactId}:`, err);
    }
    lastCursor = contactId;
    processed++;
  }

  const nextState = pausedReason ? 'paused' : (startIdx + processed >= contactIds.length ? 'completed' : 'running');
  const progressData = {
    resumeCursor: lastCursor,
    sentCount: { increment: sentDelta },
    failedCount: { increment: failedDelta },
    completedAt: nextState === 'completed' ? new Date() : undefined,
    workerStats: {
      ...stats,
      skipped,
      lastError: pausedReason,
      lastTickAt: new Date().toISOString(),
    } as any,
  };

  // Pause/cancel can arrive while this chunk is sending. Only the worker that
  // still owns the `running` state may transition it; otherwise it must not
  // resurrect a campaign that the user already stopped. Persist progress in a
  // second update while preserving the newer control state.
  const stateUpdate = await prisma.automationBroadcast.updateMany({
    where: { id: broadcastId, state: 'running' },
    data: { ...progressData, state: nextState },
  });
  if (stateUpdate.count === 0) {
    await prisma.automationBroadcast.update({ where: { id: broadcastId }, data: progressData });
    const latest = await prisma.automationBroadcast.findUnique({
      where: { id: broadcastId },
      select: { state: true },
    });
    return { state: latest?.state === 'running' ? 'running' : 'paused', processed };
  }

  return { state: nextState, processed };
}

async function pauseWithError(broadcastId: string, reason: string): Promise<void> {
  const broadcast = await prisma.automationBroadcast.findUnique({ where: { id: broadcastId }, select: { workerStats: true } });
  const stats = (broadcast?.workerStats as WorkerStats | null) ?? {};
  await prisma.automationBroadcast.update({
    where: { id: broadcastId },
    data: {
      state: 'paused',
      workerStats: { ...stats, lastError: reason, lastTickAt: new Date().toISOString() } as any,
    },
  });
  logger.warn(`[broadcast-worker:${broadcastId}] paused: ${reason}`);
}
