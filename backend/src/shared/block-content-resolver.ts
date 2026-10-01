// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * block-content-resolver.ts — Community implementation của hook
 * `resolveBlockContent` (ee-registry seam, xem shared/ee-registry/automation.ts).
 *
 * Trước 2026-09-30, hook này chỉ có default `{ok:false}` trong Community —
 * nghĩa là route gửi Khối thủ công (/conversations/:id/send-block ở
 * chat-routes.ts) và broadcast worker (mục C) đều không gửi được gì. Đăng ký
 * bản thật ở đây (gọi 1 lần lúc app boot, xem app.ts) để 2 tính năng đó hoạt
 * động — không cần chờ Extension bundle.
 *
 * Hợp đồng `Block.content` cho `actionType='send_message'` (do ta tự định
 * nghĩa — chưa có Extension nào áp đặt hình dạng khác):
 *   {
 *     text?: string,
 *     styles?: Array<{ st: string; start: number; len: number }>,
 *     attachments?: Array<{
 *       kind: 'image' | 'video' | 'file';
 *       url: string; caption?: string; filename?: string;
 *       sizeBytes?: number; mimeType?: string; durationSec?: number;
 *       thumbnailUrl?: string; mediaAssetId?: string;
 *     }>;
 *     albumImages?: boolean; // true → gộp mọi attachment kind='image' thành 1 album
 *   }
 * Nếu Extension bundle sau này đăng ký lại hook này (registerAutomationHooks),
 * bản Extension THẮNG (Object.assign ghi đè) — xem automation.ts.
 */
import type { ResolveResult, ResolvedMessage } from './ee-registry/automation.js';

interface SendMessageContent {
  text?: unknown;
  styles?: unknown;
  attachments?: unknown;
  albumImages?: unknown;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function resolveSendMessage(content: Record<string, unknown>): ResolveResult {
  const c = content as SendMessageContent;
  const resolved: ResolvedMessage[] = [];

  const text = typeof c.text === 'string' ? c.text.trim() : '';
  if (text) {
    const styles = Array.isArray(c.styles)
      ? (c.styles.filter((s) => isPlainRecord(s)) as Array<{ st: string; start: number; len: number }>)
      : null;
    resolved.push({ messageType: 'text', payload: { text, styles } });
  }

  const attachments = Array.isArray(c.attachments) ? c.attachments.filter(isPlainRecord) : [];
  const imageAttachments = attachments.filter((a) => a.kind === 'image' && typeof a.url === 'string');
  const otherAttachments = attachments.filter((a) => a.kind !== 'image');

  if (imageAttachments.length > 0 && c.albumImages) {
    resolved.push({
      messageType: 'album',
      payload: {
        items: imageAttachments.map((a) => ({
          url: String(a.url),
          caption: typeof a.caption === 'string' ? a.caption : undefined,
          mediaAssetId: typeof a.mediaAssetId === 'string' ? a.mediaAssetId : undefined,
        })),
      },
    });
  } else {
    for (const a of imageAttachments) {
      resolved.push({
        messageType: 'image',
        payload: {
          url: String(a.url),
          caption: typeof a.caption === 'string' ? a.caption : undefined,
          mediaAssetId: typeof a.mediaAssetId === 'string' ? a.mediaAssetId : undefined,
        },
      });
    }
  }

  for (const a of otherAttachments) {
    if (a.kind === 'video' && typeof a.url === 'string') {
      resolved.push({
        messageType: 'video',
        payload: {
          url: a.url,
          thumbnailUrl: typeof a.thumbnailUrl === 'string' ? a.thumbnailUrl : undefined,
          durationSec: typeof a.durationSec === 'number' ? a.durationSec : undefined,
          caption: typeof a.caption === 'string' ? a.caption : undefined,
          mediaAssetId: typeof a.mediaAssetId === 'string' ? a.mediaAssetId : undefined,
        },
      });
    } else if (a.kind === 'file' && typeof a.url === 'string') {
      resolved.push({
        messageType: 'file',
        payload: {
          url: a.url,
          filename: typeof a.filename === 'string' ? a.filename : undefined,
          sizeBytes: typeof a.sizeBytes === 'number' ? a.sizeBytes : undefined,
          mimeType: typeof a.mimeType === 'string' ? a.mimeType : undefined,
          caption: typeof a.caption === 'string' ? a.caption : undefined,
          mediaAssetId: typeof a.mediaAssetId === 'string' ? a.mediaAssetId : undefined,
        },
      });
    }
  }

  if (resolved.length === 0) {
    return { ok: false, error: 'BLOCK_EMPTY', detail: 'Khối không có nội dung (text/attachments) hợp lệ', resolved: [] };
  }
  return { ok: true, resolved };
}

export function resolveBlockContentCommunity(actionType: string, content: Record<string, unknown>): ResolveResult {
  if (actionType !== 'send_message') {
    return { ok: false, error: 'UNSUPPORTED_ACTION_TYPE', detail: `actionType "${actionType}" chưa hỗ trợ ở Community`, resolved: [] };
  }
  return resolveSendMessage(content);
}
