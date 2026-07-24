// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * call-detection.ts — tách metadata cuộc gọi (direction/loại/missed/duration) từ
 * nội dung tin nhắn hệ thống Zalo (contentType='call').
 *
 * Gộp 2 cách Zalo thực tế trả dữ liệu (đã thấy trong repo, KHÔNG suy đoán):
 *   1. `{action:"recommened.calltime"|"recommened.misscall", params:"<json string>"}`
 *      — dùng bởi engagement-service.ts parseCallMeta().
 *   2. Shape phẳng fallback `{isMissed, callType, isCaller, callDuration|duration}`
 *      — dùng bởi frontend special-message-renderer.vue (1 số version SDK).
 *
 * Khác parseCallMeta (engagement-service.ts): KHÔNG bỏ qua khi sale gọi (isSelf) —
 * CallRecord cần log cả 2 chiều, engagement chỉ quan tâm chiều KH gọi (signal ý định KH).
 */

export interface CallDetails {
  direction: 'inbound' | 'outbound';
  callType: 'voice' | 'video';
  isMissed: boolean;
  durationSec: number;
}

function extractDuration(c: Record<string, unknown>): number {
  if (c.callDuration !== undefined) return Number(c.callDuration) || 0;
  if (c.duration !== undefined) return Number(c.duration) || 0;
  if (typeof c.params === 'string') {
    try {
      const p = JSON.parse(c.params);
      return Number(p?.duration ?? 0) || 0;
    } catch {
      return 0;
    }
  }
  if (typeof c.params === 'object' && c.params !== null) {
    return Number((c.params as { duration?: unknown }).duration ?? 0) || 0;
  }
  return 0;
}

function extractIsCaller(c: Record<string, unknown>): boolean {
  if (c.isCaller !== undefined) return !!c.isCaller;
  if (typeof c.params === 'string') {
    try {
      const p = JSON.parse(c.params);
      return !!p?.isCaller;
    } catch {
      return false;
    }
  }
  if (typeof c.params === 'object' && c.params !== null) {
    return !!(c.params as { isCaller?: unknown }).isCaller;
  }
  return false;
}

export function parseCallDetails(content: unknown): CallDetails | null {
  if (typeof content !== 'object' || content === null) return null;
  const c = content as Record<string, unknown>;

  const action = typeof c.action === 'string' ? c.action : '';
  const isCallAction = action.includes('calltime') || action.includes('misscall');
  const hasFallbackShape = c.callDuration !== undefined || c.callType !== undefined;
  if (!isCallAction && !hasFallbackShape) return null;

  const callTypeStr = typeof c.callType === 'string' ? c.callType.toLowerCase() : '';
  const callType: 'voice' | 'video' = callTypeStr.includes('video') ? 'video' : 'voice';

  const durationSec = extractDuration(c);

  let isMissed: boolean;
  if (typeof c.isMissed === 'boolean') {
    isMissed = c.isMissed;
  } else if (action.includes('misscall')) {
    isMissed = true;
  } else if (callTypeStr.includes('miss')) {
    isMissed = true;
  } else {
    isMissed = durationSec === 0;
  }

  const direction: 'inbound' | 'outbound' = extractIsCaller(c) ? 'outbound' : 'inbound';

  return { direction, callType, isMissed, durationSec };
}
