// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import { prisma, tenantTransaction } from '../../shared/database/prisma-client.js';
import { withTenant } from '../../shared/tenant/tenant-context.js';
import { emitChatMessage } from '../../shared/realtime/emit-chat.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { logger } from '../../shared/utils/logger.js';
import { assertAiCapability, auditAiAction } from './ai-capabilities.js';
import { generateText, getAiConfig, getProviderApiKey } from './ai-service.js';
import { getProviderBaseUrl } from './provider-registry.js';
import { shouldTriggerAi } from './ai-virtual-chat-service.js';
import {
  chunkKnowledgeText,
  cosineSimilarity,
  isChatbotScheduleActive,
  isGenericSupportRequest,
  startOfLocalDayUtc,
} from './ai-chatbot-utils.js';

export { chunkKnowledgeText, cosineSimilarity, isChatbotScheduleActive, isGenericSupportRequest, startOfLocalDayUtc } from './ai-chatbot-utils.js';

const THROTTLE_MS = 5_000;
const MAX_DOCUMENT_BYTES = 1_000_000;
const throttleMap = new Map<string, number>();

export const GENERIC_SUPPORT_REPLY =
  'Chào bạn, mình sẵn sàng hỗ trợ. Bạn vui lòng mô tả rõ hơn nội dung cần tư vấn nhé.';

export const DEFAULT_ZALO_CHATBOT_PROMPT = [
  'Bạn là nhân viên tư vấn của doanh nghiệp đang trả lời khách qua Zalo.',
  'Chỉ sử dụng thông tin trong phần TÀI LIỆU THAM KHẢO. Không dùng kiến thức bên ngoài và không suy đoán.',
  'Nếu tài liệu không đủ để trả lời chắc chắn, chỉ trả đúng chuỗi NO_ANSWER.',
  'Trả lời ngắn gọn, tự nhiên bằng tiếng Việt. Không nhắc tới RAG, AI, tài liệu nội bộ hay độ tương đồng.',
].join('\n');

function embeddingsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base.endsWith('/v1') ? base : `${base}/v1`}/embeddings`;
}

export async function createOpenAiEmbeddings(input: {
  orgId: string;
  texts: string[];
  model: string;
}): Promise<number[][]> {
  const apiKey = await getProviderApiKey(input.orgId, 'openai');
  if (!apiKey) throw new Error('Chưa cấu hình OpenAI API key');
  const baseUrl = await getProviderBaseUrl(input.orgId, 'openai');
  const response = await fetch(embeddingsUrl(baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: input.model, input: input.texts }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`OpenAI embeddings lỗi HTTP ${response.status}`);
  const payload = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
  const sorted = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);
  if (sorted.length !== input.texts.length) throw new Error('OpenAI trả thiếu embedding');
  return sorted.map((item) => item.embedding);
}

export async function ingestKnowledgeDocument(input: {
  orgId: string;
  userId: string;
  name: string;
  mimeType?: string;
  content: string;
}) {
  const bytes = Buffer.byteLength(input.content, 'utf8');
  if (!input.content.trim()) throw new Error('Tài liệu không có nội dung');
  if (bytes > MAX_DOCUMENT_BYTES) throw new Error('Tài liệu text tối đa 1 MB');

  const config = await getAiConfig(input.orgId);
  const doc = await prisma.aiKnowledgeDoc.create({
    data: {
      orgId: input.orgId,
      name: input.name.trim().slice(0, 180) || 'Tài liệu không tên',
      mimeType: input.mimeType || 'text/plain',
      sizeBytes: bytes,
      createdById: input.userId,
    },
  });

  try {
    const chunks = chunkKnowledgeText(input.content);
    if (chunks.length === 0) throw new Error('Không tách được nội dung tài liệu');
    const embeddings: number[][] = [];
    for (let index = 0; index < chunks.length; index += 64) {
      embeddings.push(...await createOpenAiEmbeddings({
        orgId: input.orgId,
        texts: chunks.slice(index, index + 64),
        model: config.zaloChatbotEmbeddingModel,
      }));
    }
    await tenantTransaction(async (tx) => {
      await tx.aiKnowledgeChunk.createMany({
        data: chunks.map((content, position) => ({
          orgId: input.orgId,
          docId: doc.id,
          position,
          content,
          embedding: embeddings[position],
        })),
      });
      await tx.aiKnowledgeDoc.update({
        where: { id: doc.id },
        data: { status: 'ready', chunkCount: chunks.length, error: null },
      });
    });
    return prisma.aiKnowledgeDoc.findUnique({ where: { id: doc.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.aiKnowledgeDoc.update({ where: { id: doc.id }, data: { status: 'failed', error: message } });
    throw error;
  }
}

export async function triggerZaloChatbotReply(
  input: { orgId: string; conversationId: string; triggerMessageId: string },
  io: Server | null,
): Promise<void> {
  await withTenant(input.orgId, () => runZaloChatbotReply(input, io));
}

async function runZaloChatbotReply(
  input: { orgId: string; conversationId: string; triggerMessageId: string },
  io: Server | null,
): Promise<void> {
  let claimedLogId: string | null = null;
  try {
    const now = Date.now();
    if (now - (throttleMap.get(input.conversationId) ?? 0) < THROTTLE_MS) return;
    throttleMap.set(input.conversationId, now);

    const [config, org, conversation, trigger, readyDocs] = await Promise.all([
      getAiConfig(input.orgId),
      prisma.organization.findUnique({ where: { id: input.orgId }, select: { timezone: true } }),
      prisma.conversation.findFirst({
        where: { id: input.conversationId, orgId: input.orgId, isVirtual: false, threadType: 'user' },
        select: {
          id: true, externalThreadId: true, zaloAccountId: true,
          zaloAccount: { select: { privacyMode: true, ownerUserId: true } },
        },
      }),
      prisma.message.findFirst({
        where: { id: input.triggerMessageId, conversationId: input.conversationId },
        select: { id: true, senderType: true, contentType: true, content: true },
      }),
      prisma.aiKnowledgeDoc.count({ where: { orgId: input.orgId, status: 'ready' } }),
    ]);
    if (!config.enabled || !config.zaloChatbotEnabled || !conversation || readyDocs === 0) return;
    if (!conversation.externalThreadId) return;
    if (!isChatbotScheduleActive(config, new Date(), org?.timezone ?? '+07:00')) return;
    if (!trigger || trigger.senderType !== 'contact' || trigger.contentType !== 'text') return;
    const question = (trigger.content ?? '').trim();
    if (!shouldTriggerAi(question, config.aiAssistantSkipNoisePattern)) return;

    const saleHasReplied = await prisma.message.count({
      where: {
        conversationId: input.conversationId,
        senderType: 'self',
        sentVia: { in: ['user', 'user_native'] },
      },
    });
    if (saleHasReplied > 0) return;

    const startOfDay = startOfLocalDayUtc(new Date(), org?.timezone ?? '+07:00');
    const usedToday = await prisma.aiChatbotLog.count({
      where: { orgId: input.orgId, status: 'sent', createdAt: { gte: startOfDay } },
    });
    if (usedToday >= config.zaloChatbotMaxDaily) return;

    try {
      const claim = await prisma.aiChatbotLog.create({
        data: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          triggerMessageId: input.triggerMessageId,
          status: 'processing',
          question,
        },
      });
      claimedLogId = claim.id;
    } catch (error: any) {
      // Unique (orgId, triggerMessageId) là idempotency lock cross-process.
      if (error?.code === 'P2002') return;
      throw error;
    }

    const [queryEmbedding] = await createOpenAiEmbeddings({
      orgId: input.orgId,
      texts: [question],
      model: config.zaloChatbotEmbeddingModel,
    });
    const chunks = await prisma.aiKnowledgeChunk.findMany({
      where: { orgId: input.orgId, doc: { status: 'ready' } },
      select: { id: true, docId: true, content: true, embedding: true },
      take: 5_000,
    });
    const ranked = chunks
      .map((chunk) => ({
        ...chunk,
        score: cosineSimilarity(queryEmbedding, Array.isArray(chunk.embedding) ? chunk.embedding as number[] : []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(config.zaloChatbotTopK, 10)));
    const topSimilarity = ranked[0]?.score;
    let answer: string;
    let sourceDocIds: string[] = [];
    if (!ranked[0] || ranked[0].score < config.zaloChatbotSimilarity) {
      if (!isGenericSupportRequest(question)) {
        await prisma.aiChatbotLog.update({
          where: { id: claimedLogId },
          data: { status: 'skipped', reason: 'no_relevant_context', similarity: topSimilarity },
        });
        return;
      }
      answer = GENERIC_SUPPORT_REPLY;
    } else {
      const apiKey = await getProviderApiKey(input.orgId, 'openai');
      if (!apiKey) {
        await prisma.aiChatbotLog.update({ where: { id: claimedLogId }, data: { status: 'skipped', reason: 'openai_key_missing' } });
        return;
      }
      const context = ranked.map((item, index) => `[Nguồn ${index + 1}]\n${item.content}`).join('\n\n');
      answer = (await generateText(
        'openai',
        apiKey,
        config.zaloChatbotModel,
        config.zaloChatbotPromptTemplate || DEFAULT_ZALO_CHATBOT_PROMPT,
        `TÀI LIỆU THAM KHẢO:\n${context}\n\nCÂU HỎI KHÁCH HÀNG:\n${question}`,
        500,
        await getProviderBaseUrl(input.orgId, 'openai'),
      )).trim();
      if (!answer || /^NO_ANSWER[.!]?$/i.test(answer)) {
        await prisma.aiChatbotLog.update({
          where: { id: claimedLogId },
          data: { status: 'skipped', reason: 'model_declined', similarity: topSimilarity },
        });
        return;
      }
      sourceDocIds = [...new Set(ranked.map((item) => item.docId))];
    }

    const manualReplyNowExists = await prisma.message.count({
      where: {
        conversationId: input.conversationId,
        senderType: 'self',
        sentVia: { in: ['user', 'user_native'] },
      },
    });
    if (manualReplyNowExists > 0) {
      await prisma.aiChatbotLog.update({ where: { id: claimedLogId }, data: { status: 'skipped', reason: 'sale_replied' } });
      return;
    }

    assertAiCapability('send_zalo_chatbot_reply');
    const replyMessageId = randomUUID();
    const sentAt = new Date();
    await prisma.message.create({
      data: {
        id: replyMessageId,
        conversationId: input.conversationId,
        zaloMsgId: null,
        senderType: 'self',
        senderUid: 'ai:zalo-chatbot',
        senderName: 'AI Chatbot',
        content: answer,
        contentType: 'text',
        sentAt,
        sentVia: 'automation',
        metadata: { sender: { kind: 'bot_ai', name: 'AI Chatbot', detail: 'Chatbot Zalo' }, triggerMessageId: trigger.id },
      },
    });

    let sendResult: any;
    try {
      sendResult = await zaloOps.sendMessage(
        conversation.zaloAccountId,
        conversation.externalThreadId || '',
        0,
        { msg: answer },
        // Không cho zaloOps emit raw global event; persisted message được emit có
        // tenant scope + privacy redaction qua emitChatMessage bên dưới.
        null,
      );
    } catch (error) {
      await prisma.message.delete({ where: { id: replyMessageId } }).catch(() => undefined);
      throw error;
    }
    const zaloMsgId = String(sendResult?.message?.msgId ?? sendResult?.msgId ?? '') || null;
    const saved = await prisma.message.update({
      where: { id: replyMessageId },
      data: { zaloMsgId, zaloMsgIdNum: zaloMsgId && /^\d+$/.test(zaloMsgId) ? BigInt(zaloMsgId) : null },
    });
    await prisma.conversation.update({
      where: { id: input.conversationId },
      data: { lastMessageAt: sentAt, isReplied: true },
    });
    await prisma.aiChatbotLog.update({
      where: { id: claimedLogId },
      data: {
        replyMessageId,
        status: 'sent',
        answer,
        similarity: topSimilarity,
        sourceDocIds,
      },
    });
    auditAiAction(input.orgId, 'zalo_chatbot_reply', {
      conversationId: input.conversationId,
      triggerMessageId: trigger.id,
      replyMessageId,
      similarity: topSimilarity,
    });
    await emitChatMessage({
      io,
      orgId: input.orgId,
      accountId: conversation.zaloAccountId,
      conversationId: input.conversationId,
      message: { ...saved, zaloMsgIdNum: saved.zaloMsgIdNum?.toString() ?? null },
      privacyMode: conversation.zaloAccount.privacyMode,
      ownerUserId: conversation.zaloAccount.ownerUserId,
      extra: { _aiChatbot: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[ai-zalo-chatbot] ${message}`);
    if (claimedLogId) {
      await prisma.aiChatbotLog.update({
        where: { id: claimedLogId },
        data: { status: 'error', reason: message.slice(0, 500) },
      }).catch(() => undefined);
    } else {
      await prisma.aiChatbotLog.create({
        data: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          triggerMessageId: input.triggerMessageId,
          status: 'error',
          reason: message.slice(0, 500),
        },
      }).catch(() => undefined);
    }
  }
}
