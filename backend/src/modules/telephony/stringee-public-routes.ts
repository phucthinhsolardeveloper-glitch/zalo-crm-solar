// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { stringeeIdentity } from './stringee-token.js';

type StringeeEndpoint = { type: 'internal' | 'external'; number: string; alias?: string };

function webhookUrl(path: string): string {
  return config.stringeeWebhookBaseUrl ? `${config.stringeeWebhookBaseUrl}${path}` : '';
}

function recordAndConnect(from: StringeeEndpoint, to: StringeeEndpoint) {
  return [
    {
      action: 'record',
      eventUrl: webhookUrl('/api/v1/telephony/stringee/recording-events'),
      format: 'mp3',
    },
    {
      action: 'connect',
      from,
      to,
      timeout: 45,
      maxConnectTime: -1,
      peerToPeerCall: false,
    },
  ];
}

function connectAppToPhone(fromNumber: string, toNumber: string) {
  // Keep the PSTN SCCO identical to Stringee's documented app-to-phone shape.
  // Outbound recording is already enabled on the PCC Number, so issuing a
  // second record action here is unnecessary and can terminate the PSTN leg
  // before the carrier starts ringing.
  return [
    {
      action: 'connect',
      from: { type: 'internal' as const, number: fromNumber, alias: fromNumber },
      to: { type: 'external' as const, number: toNumber, alias: toNumber },
    },
  ];
}

async function activeUserByStringeeId(identity: string) {
  if (!identity) return null;
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, orgId: true, fullName: true },
  });
  return users.find((user) => stringeeIdentity(user.id) === identity) || null;
}

function validProject(projectId: unknown): boolean {
  return !config.stringeeProjectId || !projectId || String(projectId) === config.stringeeProjectId;
}

function publicConfigured(reply: FastifyReply): boolean {
  if (!config.stringeeEnabled || !config.stringeeFromNumber || !config.stringeeInboundUserId) {
    void reply.status(503).send({ error: 'Stringee phone gateway chưa được cấu hình đầy đủ' });
    return false;
  }
  return true;
}

export function mapStringeeEventStatus(body: Record<string, unknown>): string | null {
  const raw = String(body.call_status || body.callStatus || body.status || '').toLowerCase();
  const answerDuration = Number(body.answerDuration || body.answer_duration || 0);
  const cause = String(body.endCallCause || body.end_call_cause || '').toLowerCase();
  if (raw.includes('ring')) return 'ringing';
  if (raw.includes('answer')) return 'answered';
  if (raw.includes('end')) {
    if (answerDuration > 0) return 'completed';
    if (cause.includes('busy') || cause.includes('reject') || cause.includes('486')) return 'rejected';
    return 'missed';
  }
  if (raw.includes('create') || raw.includes('start')) return 'initiated';
  return null;
}

export async function stringeePublicRoutes(app: FastifyInstance) {
  // Project Answer URL: Web SDK -> another CRM user or a PSTN number.
  app.get('/api/v1/telephony/stringee/answer', async (request, reply) => {
    if (!publicConfigured(reply)) return;
    const query = request.query as Record<string, string | undefined>;
    if (!validProject(query.projectId || query.project_id)) return reply.status(403).send({ error: 'Sai Stringee project' });

    // `fromInternal` is a boolean flag (usually the string "true"), never an
    // agent identity. Treating it as a user ID makes the Answer URL reject an
    // otherwise valid outbound call when Stringee omits `userId`.
    const callerIdentity = query.userId || query.user_id || query.stringee_user_id || query.agentUserId || '';
    const caller = await activeUserByStringeeId(callerIdentity);
    if (!caller) return reply.status(403).send({ error: 'Stringee user không hợp lệ' });

    const target = query.to || '';
    if (target.startsWith('crm_')) {
      const callee = await activeUserByStringeeId(target);
      if (!callee || callee.orgId !== caller.orgId) return reply.status(404).send({ error: 'Không tìm thấy nhân viên nhận cuộc gọi' });
      return recordAndConnect(
        { type: 'internal', number: callerIdentity, alias: caller.fullName },
        { type: 'internal', number: target, alias: caller.fullName },
      );
    }

    const destination = normalizePhone(target);
    const requestedFrom = normalizePhone(query.from || '');
    const configuredFrom = normalizePhone(config.stringeeFromNumber);
    if (!destination || requestedFrom !== configuredFrom) return reply.status(400).send({ error: 'Số gọi đi không hợp lệ' });
    return connectAppToPhone(config.stringeeFromNumber, destination);
  });

  // Number Answer URL: PSTN caller -> configured CRM agent in the browser.
  app.get('/api/v1/telephony/stringee/inbound-answer', async (request, reply) => {
    if (!publicConfigured(reply)) return;
    const query = request.query as Record<string, string | undefined>;
    if (!validProject(query.projectId || query.project_id)) return reply.status(403).send({ error: 'Sai Stringee project' });
    if (normalizePhone(query.to) !== normalizePhone(config.stringeeFromNumber)) {
      return reply.status(404).send({ error: 'Hotline không hợp lệ' });
    }
    const agent = await activeUserByStringeeId(config.stringeeInboundUserId);
    const callerNumber = normalizePhone(query.from);
    if (!agent || !callerNumber) return reply.status(503).send({ error: 'Agent hoặc số gọi đến không hợp lệ' });
    return recordAndConnect(
      { type: 'external', number: callerNumber, alias: query.from || callerNumber },
      { type: 'internal', number: config.stringeeInboundUserId, alias: 'Zalo CRM' },
    );
  });

  app.post('/api/v1/telephony/stringee/events', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body || {}) as Record<string, any>;
    if (!validProject(body.project_id || body.projectId)) return reply.status(403).send({ error: 'Sai Stringee project' });
    const callId = String(body.call_id || body.callId || '');
    const status = mapStringeeEventStatus(body);
    if (!callId || !status) return { success: true, matched: 0 };

    const now = new Date();
    const terminal = ['completed', 'rejected', 'missed', 'failed'].includes(status);
    const duration = Number(body.answerDuration ?? body.answer_duration ?? body.duration);
    const result = await prisma.telephonyCall.updateMany({
      where: { providerCallId: callId },
      data: {
        status,
        ...(status === 'answered' ? { answeredAt: now } : {}),
        ...(terminal ? { endedAt: now, recordingId: callId } : {}),
        ...(Number.isFinite(duration) ? { durationSec: Math.max(0, Math.round(duration)) } : {}),
        ...(body.endCallCause ? {
          endReason: [body.endCallCause, body.endedBy ? `endedBy=${body.endedBy}` : ''].filter(Boolean).join(' | ').slice(0, 255),
        } : {}),
      },
    });
    return { success: true, matched: result.count };
  });

  app.post('/api/v1/telephony/stringee/recording-events', async (request) => {
    const body = (request.body || {}) as Record<string, any>;
    const callId = String(body.call_id || body.callId || '');
    const recordingId = String(body.recording_id || body.recordingId || body.recording_url || callId || '');
    if (callId && recordingId) {
      await prisma.telephonyCall.updateMany({ where: { providerCallId: callId }, data: { recordingId } });
    }
    return { success: true };
  });
}
