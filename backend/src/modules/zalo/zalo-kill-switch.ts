// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * zalo-kill-switch.ts — per-nick outbound pause (Tranche 2 gate item).
 *
 * Distinct from disconnect: a paused account keeps its WS session (still
 * receives incoming messages, friend events, etc.) but every outbound call
 * through zalo-operations.ts is refused until an admin resumes it. Use when
 * an account shows abnormal signals (429 burst, rejected spike) and a full
 * disconnect would also cut off inbound visibility needed to investigate.
 */
import { prisma } from '../../shared/database/prisma-client.js';

interface PauseState { paused: boolean; reason: string | null }

const CACHE_TTL_MS = 5_000; // short — this is a manual emergency control, not a hot-path config value
const cache = new Map<string, { state: PauseState; expiresAt: number }>();

export function invalidateSendingPauseCache(accountId: string): void {
  cache.delete(accountId);
}

export async function isSendingPaused(accountId: string): Promise<PauseState> {
  const hit = cache.get(accountId);
  if (hit && hit.expiresAt > Date.now()) return hit.state;

  const account = await prisma.zaloAccount.findUnique({
    where: { id: accountId },
    select: { sendingPausedAt: true, sendingPausedReason: true },
  });
  const state: PauseState = {
    paused: Boolean(account?.sendingPausedAt),
    reason: account?.sendingPausedReason ?? null,
  };
  cache.set(accountId, { state, expiresAt: Date.now() + CACHE_TTL_MS });
  return state;
}

export async function pauseSending(accountId: string, reason: string, byUserId: string): Promise<void> {
  await prisma.zaloAccount.update({
    where: { id: accountId },
    data: {
      sendingPausedAt: new Date(),
      sendingPausedReason: reason,
      sendingPausedById: byUserId,
    },
  });
  invalidateSendingPauseCache(accountId);
}

export async function resumeSending(accountId: string): Promise<void> {
  await prisma.zaloAccount.update({
    where: { id: accountId },
    data: {
      sendingPausedAt: null,
      sendingPausedReason: null,
      sendingPausedById: null,
    },
  });
  invalidateSendingPauseCache(accountId);
}
