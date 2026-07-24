// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * call-service.ts — CRUD cho CallRecord: log thủ công (click-to-call), auto-detect
 * từ tin nhắn hệ thống Zalo, upload/xoá ghi âm (tái dùng StorageDriver + AV scan).
 */
import { prisma } from '../../shared/database/prisma-client.js';
import { uploadBuffer } from '../../shared/storage/minio-client.js';
import { logger } from '../../shared/utils/logger.js';
import type { CallDetails } from './call-detection.js';

export interface CreateManualCallInput {
  orgId: string;
  contactId: string;
  friendId?: string | null;
  zaloAccountId: string;
  conversationId?: string | null;
  callType: 'voice' | 'video';
  direction: 'inbound' | 'outbound';
  durationSec?: number | null;
  occurredAt?: Date;
  note?: string | null;
  createdByUserId?: string | null;
}

export async function createManualCall(input: CreateManualCallInput) {
  return prisma.callRecord.create({
    data: {
      orgId: input.orgId,
      contactId: input.contactId,
      friendId: input.friendId ?? null,
      zaloAccountId: input.zaloAccountId,
      conversationId: input.conversationId ?? null,
      callType: input.callType,
      direction: input.direction,
      status: 'manual',
      durationSec: input.durationSec ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      note: input.note ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export interface UpsertFromMessageInput {
  orgId: string;
  contactId: string;
  zaloAccountId: string;
  conversationId: string | null;
  sourceMessageId: string;
  occurredAt: Date;
  details: CallDetails;
}

/**
 * Idempotent theo sourceMessageId — an toàn khi message-handler xử lý lại cùng 1
 * message (retry/replay listener zca-js).
 */
export async function upsertCallRecordFromMessage(input: UpsertFromMessageInput): Promise<void> {
  const status = input.details.isMissed ? 'missed' : 'connected';
  const data = {
    orgId: input.orgId,
    contactId: input.contactId,
    zaloAccountId: input.zaloAccountId,
    conversationId: input.conversationId,
    direction: input.details.direction,
    callType: input.details.callType,
    status,
    durationSec: input.details.durationSec,
    occurredAt: input.occurredAt,
    sourceMessageId: input.sourceMessageId,
  };
  try {
    await prisma.callRecord.upsert({
      where: { sourceMessageId: input.sourceMessageId },
      create: data,
      update: {}, // đã tồn tại (replay) → giữ nguyên, không ghi đè
    });
  } catch (err) {
    logger.warn(`[calls] upsertCallRecordFromMessage lỗi (best-effort, bỏ qua): ${err}`);
  }
}

export async function listCallsForContact(orgId: string, contactId: string) {
  return prisma.callRecord.findMany({
    where: { orgId, contactId },
    orderBy: { occurredAt: 'desc' },
  });
}

/**
 * Tra contactId của 1 CallRecord (scoped theo orgId) — dùng để kiểm tra
 * assertContactVisible trước khi cho phép upload/xoá ghi âm (chặn truy cập
 * chéo contact trong cùng org). Trả null nếu không tồn tại/không thuộc org.
 */
export async function getCallRecordContactId(orgId: string, callId: string): Promise<string | null> {
  const result = await prisma.callRecord.findFirst({
    where: { id: callId, orgId },
    select: { contactId: true },
  });
  return result?.contactId ?? null;
}

export interface AttachRecordingInput {
  orgId: string;
  callId: string;
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

/** Trả null nếu callId không tồn tại/không thuộc org (caller trả 404). */
export async function attachRecording(input: AttachRecordingInput) {
  const existing = await prisma.callRecord.findFirst({
    where: { id: input.callId, orgId: input.orgId },
    select: { id: true },
  });
  if (!existing) return null;

  const uploaded = await uploadBuffer(input.buffer, input.mimeType, input.originalName);
  return prisma.callRecord.update({
    where: { id: input.callId },
    data: {
      recordingKey: uploaded.key,
      recordingUrl: uploaded.url,
      recordingMimeType: uploaded.mimeType,
      recordingSizeBytes: uploaded.size,
    },
  });
}

/** Trả null nếu callId không tồn tại/không thuộc org (caller trả 404). */
export async function removeRecording(orgId: string, callId: string) {
  const existing = await prisma.callRecord.findFirst({
    where: { id: callId, orgId },
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.callRecord.update({
    where: { id: callId },
    data: {
      recordingKey: null,
      recordingUrl: null,
      recordingMimeType: null,
      recordingSizeBytes: null,
    },
  });
}
