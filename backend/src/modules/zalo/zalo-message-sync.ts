// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * zalo-message-sync.ts — polling backup for group message history.
 * Runs periodically per connected account and asks the SDK listener for the
 * latest group-message page. The old HTTP getGroupChatHistory endpoint now
 * returns 404 at provider level; WebSocket old_messages remains supported.
 *
 * This is a safety net — the primary sync path is selfListen + old_messages.
 */
import { logger } from '../../shared/utils/logger.js';

const SYNC_INTERVAL_MS = 5 * 60_000; // 5 minutes
const THREAD_TYPE_GROUP = 1;

// Track active sync intervals per account
const syncIntervals = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Sync recent group messages for one account.
 * Returns the number of newly inserted messages.
 */
function requestGroupMessages(api: any, accountId: string): void {
  if (!api?.listener?.requestOldMessages) {
    logger.debug(`[sync:${accountId}] requestOldMessages unavailable; skip group backup tick`);
    return;
  }
  // Main listener's old_messages handler owns persistence and already performs
  // idempotent message dedup. One request returns the newest group page globally,
  // avoiding N HTTP requests (and the provider's current 404) per account.
  api.listener.requestOldMessages(THREAD_TYPE_GROUP, null);
}

/** Start periodic group sync for an account. */
export function startMessageSync(api: any, accountId: string): void {
  // Don't start duplicate sync
  if (syncIntervals.has(accountId)) return;

  const interval = setInterval(async () => {
    try {
      requestGroupMessages(api, accountId);
    } catch (err) {
      logger.warn(`[sync:${accountId}] Sync error:`, err);
    }
  }, SYNC_INTERVAL_MS);

  syncIntervals.set(accountId, interval);
  logger.info(`[sync:${accountId}] Started group message sync (every ${SYNC_INTERVAL_MS / 1000}s)`);
}

/** Stop periodic sync for an account. */
export function stopMessageSync(accountId: string): void {
  const interval = syncIntervals.get(accountId);
  if (interval) {
    clearInterval(interval);
    syncIntervals.delete(accountId);
    logger.info(`[sync:${accountId}] Stopped group message sync`);
  }
}
