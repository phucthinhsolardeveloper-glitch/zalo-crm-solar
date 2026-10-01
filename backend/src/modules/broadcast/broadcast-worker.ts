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
 * Phase 3a (2026-10-01): hỗ trợ tối đa 1 phần text + 1 phần ảnh/album (ghép
 * thành 1 tin ảnh có caption — 1 lần reserve quota/người nhận, không phải 2).
 * Block nhiều thành phần khác (video/file/>1 phần text hoặc media) CHƯA hỗ
 * trợ gửi hàng loạt — pause + báo lỗi rõ thay vì gửi thiếu.
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { zaloOps, ZaloOpError } from '../../shared/zalo-operations.js';
import { zaloPool } from '../zalo/zalo-pool.js';
import { resolveBlockContent } from '../../shared/ee-registry/automation.js';
import { downloadMediaToTemp } from '../chat/chat-media-helpers.js';

export const BROADCAST_CHUNK_SIZE = 10;

interface SegmentSpec { contactIds: string[] }

interface PacingSpec {
  batchSize: number;
  intervalSec: number;
}

interface WorkerStats {
  skipped?: Array<{ contactId: string; reason: string; at: string }>;
  lastError?: string | null;
  lastTickAt?: string;
}

interface BroadcastContent {
  text: string | null;
  imageUrls: string[] | null; // từ 1 phần 'image' (1 url) hoặc 'album' (N url)
}

/** Resolve Block → {text?, imageUrls?}. Trả null nếu Block rỗng/không resolve
 * được, hoặc có thành phần KHÔNG hỗ trợ (video/file/nhiều hơn 1 phần text
 * hoặc media) — broadcast dừng rõ ràng thay vì gửi thiếu nội dung. */
function extractBroadcastContent(content: unknown): BroadcastContent | null {
  const result = resolveBlockContent('send_message', (content as Record<string, unknown>) ?? {});
  if (!result.ok || result.resolved.length === 0) return null;

  let text: string | null = null;
  let imageUrls: string[] | null = null;
  for (const m of result.resolved) {
    if (m.messageType === 'text') {
      if (text !== null) return null; // >1 phần text — chưa hỗ trợ
      text = m.payload.text;
    } else if (m.messageType === 'image') {
      if (imageUrls !== null) return null; // >1 phần media — chưa hỗ trợ
      imageUrls = [m.payload.url];
    } else if (m.messageType === 'album') {
      if (imageUrls !== null) return null;
      imageUrls = m.payload.items.map((it) => it.url);
    } else {
      return null; // video/file/friend_request/update_status — chưa hỗ trợ ở broadcast
    }
  }
  if (!text && !imageUrls) return null;
  return { text, imageUrls };
}

export interface TickResult {
  state: 'running' | 'paused' | 'completed' | 'scheduled';
  processed: number;
  nextDelayMs?: number;
}

function readPacing(value: unknown): PacingSpec {
  const pacing = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawBatch = Number(pacing.batchSize ?? BROADCAST_CHUNK_SIZE);
  const rawInterval = Number(pacing.intervalSec ?? 30);
  return {
    batchSize: Number.isFinite(rawBatch) ? Math.min(50, Math.max(1, Math.floor(rawBatch))) : BROADCAST_CHUNK_SIZE,
    intervalSec: Number.isFinite(rawInterval) ? Math.min(86_400, Math.max(30, Math.floor(rawInterval))) : 30,
  };
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
  // 'scheduled' là trạng thái CHỜ hợp lệ — tick đầu tiên tới đây đúng lúc
  // BullMQ job (đã delay tới scheduledAt) thật sự chạy, và sẽ tự chuyển sang
  // 'running' bên dưới. Mọi trạng thái khác (paused/completed/cancelled) đều
  // dừng, không xử lý tiếp.
  if (broadcast.state !== 'running' && broadcast.state !== 'scheduled') {
    logger.info(`[broadcast-worker] broadcast ${broadcastId} state=${broadcast.state} — skip tick`);
    return { state: broadcast.state as TickResult['state'], processed: 0 };
  }
  // Phòng lệch giờ hệ thống/trigger tay sớm: nếu vẫn chưa tới giờ hẹn, tự
  // enqueue lại đúng phần delay còn thiếu thay vì gửi sớm.
  if (broadcast.state === 'scheduled' && broadcast.scheduledAt && broadcast.scheduledAt.getTime() > Date.now()) {
    return { state: 'scheduled', processed: 0, nextDelayMs: broadcast.scheduledAt.getTime() - Date.now() };
  }
  if (broadcast.state === 'scheduled') {
    await prisma.automationBroadcast.update({
      where: { id: broadcastId },
      data: { state: 'running', startedAt: broadcast.startedAt ?? new Date() },
    });
  }

  const block = await prisma.block.findUnique({ where: { id: broadcast.blockId } });
  if (!block || !block.ownerNickId) {
    await pauseWithError(broadcastId, 'block_missing_or_no_owner_nick');
    return { state: 'paused', processed: 0 };
  }
  const broadcastContent = extractBroadcastContent(block.content);
  if (!broadcastContent) {
    await pauseWithError(broadcastId, 'block_content_empty_or_unsupported');
    return { state: 'paused', processed: 0 };
  }
  const nickId = block.ownerNickId;
  const pacing = readPacing(broadcast.pacing);

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

  // Tải ảnh/album 1 LẦN cho cả chunk (không tải lại mỗi người nhận) — cùng nội
  // dung cho mọi contact trong 1 tick. Dọn file tạm ở finally bên dưới.
  let mediaPaths: string[] | null = null;
  const mediaCleanups: Array<() => Promise<void>> = [];
  if (broadcastContent.imageUrls) {
    try {
      mediaPaths = [];
      for (const url of broadcastContent.imageUrls) {
        const dl = await downloadMediaToTemp({ url }, 'image');
        mediaCleanups.push(dl.cleanup);
        mediaPaths.push(dl.path);
      }
    } catch (err) {
      for (const c of mediaCleanups) await c().catch(() => {});
      logger.warn(`[broadcast-worker:${broadcastId}] tải ảnh thất bại:`, err);
      await pauseWithError(broadcastId, 'attachment_download_failed');
      return { state: 'paused', processed: 0 };
    }
  }

  const chunk = contactIds.slice(startIdx, startIdx + pacing.batchSize);
  let processed = 0;
  let sentDelta = 0;
  let failedDelta = 0;
  let lastCursor = broadcast.resumeCursor;
  let pausedReason: string | null = null;
  let waitReason: string | null = null;
  let nextDelayMs: number | undefined;

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
      if (mediaPaths) {
        // Ảnh/album → 1 tin ảnh có caption (= phần text nếu có) — 1 lần reserve
        // quota/người nhận, không tách thành 2 tin (text + ảnh riêng).
        await zaloOps.sendCampaignImage(nickId, threadId, 0, mediaPaths, undefined, broadcastContent.text ?? '');
      } else {
        await zaloOps.sendCampaignMessage(nickId, threadId, 0, { msg: broadcastContent.text });
      }
      sentDelta++;
    } catch (err) {
      if (err instanceof ZaloOpError && err.code === 'RATE_LIMITED') {
        // Burst limit chỉ là cửa sổ chờ ngắn: giữ broadcast ở running và
        // retry contact hiện tại sau 60s. Chỉ daily quota mới pause để admin
        // chủ động quyết định resume ngày hôm sau.
        if (/Đã đạt giới hạn .*\/ngày/i.test(err.message)) {
          pausedReason = 'quota_exhausted';
        } else {
          waitReason = 'rate_limited_wait';
          nextDelayMs = 60_000;
        }
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

  for (const c of mediaCleanups) await c().catch(() => {});

  const nextState = pausedReason ? 'paused' : (startIdx + processed >= contactIds.length ? 'completed' : 'running');
  const progressData = {
    resumeCursor: lastCursor,
    sentCount: { increment: sentDelta },
    failedCount: { increment: failedDelta },
    completedAt: nextState === 'completed' ? new Date() : undefined,
    workerStats: {
      ...stats,
      skipped,
      lastError: pausedReason ?? waitReason,
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
    return { state: latest?.state === 'running' ? 'running' : 'paused', processed, nextDelayMs };
  }

  return {
    state: nextState,
    processed,
    nextDelayMs: nextState === 'running' ? (nextDelayMs ?? pacing.intervalSec * 1000) : undefined,
  };
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
