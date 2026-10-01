// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * zalo-message-sync.ts — polling backup for group message history.
 *
 * Realtime delivery remains owned by the SDK `message` event. This module is
 * only a safety net for messages missed while the listener was reconnecting.
 * It must query one concrete group at a time: zca-js `requestOldMessages(1,
 * null)` returns a global page and has no group-id filter, so it is not safe
 * for periodic polling (it repeatedly replays old messages from unrelated
 * groups).
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { handleIncomingMessage } from '../chat/message-handler.js';
import { detectContentType, extractAlbumInfo } from './zalo-message-helpers.js';
import { withTenant, runSystemQuery } from '../../shared/tenant/tenant-context.js';

const SYNC_INTERVAL_MS = 5 * 60_000; // 5 minutes
const MAX_GROUPS_PER_SYNC = 20;
const MESSAGES_PER_GROUP = 50;

// Track active sync intervals per account.
const syncIntervals = new Map<string, ReturnType<typeof setInterval>>();
// Avoid overlapping polls when a provider request takes longer than the interval.
const syncInFlight = new Set<string>();
// Provider currently returns 404 for this endpoint in some environments. Once
// detected, stop retrying every five minutes until the account reconnects.
const groupHistoryUnavailable = new Set<string>();

/** SDK/provider error classifier kept intentionally conservative. */
export function isGroupHistoryUnavailableError(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  const code = String(candidate?.code ?? candidate?.status ?? '');
  const message = String(candidate?.message ?? error ?? '');
  return code === '404' || /(?:^|\D)404(?:\D|$)|not found/i.test(message);
}

export function extractGroupHistoryMessages(history: any): any[] {
  const messages = history?.groupMsgs || history?.data?.groupMsgs || [];
  return Array.isArray(messages) ? messages : [];
}

/**
 * Sync recent messages for the most recently active groups of one account.
 * Returns the number of newly inserted messages.
 */
async function syncGroupMessages(api: any, accountId: string): Promise<number> {
  if (groupHistoryUnavailable.has(accountId)) return 0;

  // Lookup org before entering tenant context (background pool has no request ctx).
  const account = await runSystemQuery(() =>
    prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { orgId: true },
    }),
  );
  if (!account) return 0;

  return withTenant(account.orgId, () => syncGroupMessagesInOrg(api, accountId));
}

async function syncGroupMessagesInOrg(api: any, accountId: string): Promise<number> {
  const groupConvs = await prisma.conversation.findMany({
    where: { zaloAccountId: accountId, threadType: 'group' },
    select: { id: true, externalThreadId: true },
    take: MAX_GROUPS_PER_SYNC,
    orderBy: { lastMessageAt: 'desc' },
  });

  let synced = 0;

  for (const conv of groupConvs) {
    const groupId = String(conv.externalThreadId || '').trim();
    if (!groupId) continue;

    try {
      // This call is intentionally group-scoped. Do not replace it with
      // listener.requestOldMessages(1, null): that request is global.
      const history = await api.getGroupChatHistory(groupId, MESSAGES_PER_GROUP);
      const messages = extractGroupHistoryMessages(history);

      const msgIdMap = new Map<string, any>();
      for (const msg of messages) {
        const zaloMsgId = String(msg?.data?.msgId || msg?.data?.cliMsgId || '');
        if (zaloMsgId) msgIdMap.set(zaloMsgId, msg);
      }
      if (msgIdMap.size === 0) continue;

      // Avoid entering message-handler/P2002 for the repeated history page.
      const existing = await prisma.message.findMany({
        where: { conversationId: conv.id, zaloMsgId: { in: [...msgIdMap.keys()] } },
        select: { zaloMsgId: true },
      });
      const existingIds = new Set(existing.map((message: { zaloMsgId: string | null }) => message.zaloMsgId));

      for (const [zaloMsgId, msg] of msgIdMap) {
        if (existingIds.has(zaloMsgId)) continue;

        const rawContent = msg?.data?.content;
        const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent || '');
        const contentType = detectContentType(msg?.data?.msgType, rawContent);
        const album = extractAlbumInfo(contentType, rawContent);

        const result = await handleIncomingMessage({
          accountId,
          senderUid: String(msg?.data?.uidFrom || ''),
          senderName: msg?.data?.dName || '',
          content,
          contentType,
          msgId: zaloMsgId,
          timestamp: parseInt(msg?.data?.ts || String(Date.now()), 10),
          isSelf: Boolean(msg?.isSelf),
          threadId: groupId,
          threadType: 'group',
          groupName: msg?.groupName || undefined,
          groupAvatarUrl: msg?.groupAvatarUrl || undefined,
          groupMembersCount: typeof msg?.groupMembersCount === 'number' ? msg.groupMembersCount : undefined,
          attachments: [],
          quote: msg?.data?.quote,
          albumKey: album.albumKey,
          albumIndex: album.albumIndex,
          albumTotal: album.albumTotal,
          isBackfill: true,
        });

        if (result) synced++;
      }
    } catch (error) {
      if (isGroupHistoryUnavailableError(error)) {
        groupHistoryUnavailable.add(accountId);
        logger.warn(
          `[sync:${accountId}] Provider không hỗ trợ getGroupChatHistory (404); ` +
          'tắt polling lịch sử nhóm để không replay tin toàn cục. Realtime listener vẫn hoạt động.',
        );
        break;
      }
      logger.warn(`[sync:${accountId}] Group ${groupId} failed:`, error);
    }
  }

  return synced;
}

/** Start periodic group sync for an account. */
export function startMessageSync(api: any, accountId: string): void {
  if (syncIntervals.has(accountId)) return;

  groupHistoryUnavailable.delete(accountId);
  const interval = setInterval(() => {
    if (syncInFlight.has(accountId)) return;
    syncInFlight.add(accountId);
    void syncGroupMessages(api, accountId)
      .then((count) => {
        if (count > 0) logger.info(`[sync:${accountId}] Backfilled ${count} group messages`);
      })
      .catch((error) => logger.warn(`[sync:${accountId}] Sync error:`, error))
      .finally(() => syncInFlight.delete(accountId));
  }, SYNC_INTERVAL_MS);

  syncIntervals.set(accountId, interval);
  logger.info(`[sync:${accountId}] Started targeted group message sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
}

/** Stop periodic sync for an account. */
export function stopMessageSync(accountId: string): void {
  const interval = syncIntervals.get(accountId);
  if (interval) {
    clearInterval(interval);
    syncIntervals.delete(accountId);
    logger.info(`[sync:${accountId}] Stopped group message sync`);
  }
  groupHistoryUnavailable.delete(accountId);
}
