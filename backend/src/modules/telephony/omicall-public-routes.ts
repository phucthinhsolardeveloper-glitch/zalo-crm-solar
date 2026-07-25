// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { logger } from '../../shared/utils/logger.js';
import { mapOmicallEventStatus } from './omicall-status.js';

function hasValidWebhookKey(request: FastifyRequest): boolean {
  const query = request.query as Record<string, string | undefined>;
  return Boolean(config.omicallWebhookSecret) && query.key === config.omicallWebhookSecret;
}

export async function omicallPublicRoutes(app: FastifyInstance) {
  app.post('/api/v1/telephony/omicall/events', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!hasValidWebhookKey(request)) {
      return reply.status(403).send({ error: 'Sai webhook key' });
    }
    const body = (request.body || {}) as Record<string, any>;
    const transactionId = String(body.transaction_id || body.call_uuid || '');
    const status = mapOmicallEventStatus(body);
    if (!transactionId || !status) return { success: true, matched: 0 };

    const eventDate = (value: unknown): Date | undefined => {
      const timestamp = Number(value);
      if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined;
      return new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000);
    };
    const now = new Date();
    const startedAt = eventDate(body.time_start_call || body.event_time || body.created_time);
    const answeredAt = eventDate(body.time_start_to_answer);
    const endedAt = eventDate(body.time_end_call);
    const terminal = ['completed', 'rejected', 'missed', 'failed'].includes(status);
    const billSec = Number(body.bill_sec ?? 0);
    const recordingUrl = String(body.recording_file_url || body.recording_file || '').trim();
    const callData = {
      status,
      ...(status === 'answered' ? { answeredAt: answeredAt || now } : {}),
      ...(status === 'completed' && answeredAt ? { answeredAt } : {}),
      ...(terminal ? { endedAt: endedAt || now } : {}),
      ...(Number.isFinite(billSec) && billSec > 0 ? { durationSec: Math.round(billSec) } : {}),
      ...(recordingUrl ? { recordingId: recordingUrl } : {}),
    };
    const result = await prisma.telephonyCall.updateMany({
      where: { providerCallId: transactionId },
      data: callData,
    });

    // Pure inbound (phone -> web) or the agent's browser didn't create a log
    // row in time: no existing row matched this transaction_id — create one
    // from the webhook payload itself.
    let matched = result.count;
    let created = false;
    if (result.count === 0 && status !== 'initiated') {
      const usersStatus = Array.isArray(body.users_status)
        ? body.users_status
        : Array.isArray(body.user_status)
          ? body.user_status
          : [];
      const answeredUser = usersStatus.find((item: any) => Number(item?.answer_at) > 0);
      const extension = String(body.extension || body.sip_user || answeredUser?.extension || '');
      const rawDirection = String(body.direction || '').toLowerCase();
      const direction = rawDirection === 'outbound' ? 'outbound' : 'inbound';
      const rawPhone = body.phone_number
        || (direction === 'outbound' ? body.to_number || body.destination_number : body.from_number || body.source_number);
      const phoneNumber = normalizePhone(String(rawPhone || ''));
      if (extension && phoneNumber) {
        const owner = await prisma.user.findFirst({
          where: { omicallExtension: extension, isActive: true },
          select: { id: true, orgId: true },
        });
        if (owner) {
          const variants = phoneVariants(phoneNumber);
          const contact = await prisma.contact.findFirst({
            where: {
              orgId: owner.orgId,
              mergedInto: null,
              OR: [{ phoneNormalized: phoneNumber }, { phone: { in: variants } }, { phone2: { in: variants } }, { phone3: { in: variants } }],
            },
            select: { id: true },
          });
          const callWindowStart = new Date((startedAt || now).getTime() - 2 * 60_000);
          const callWindowEnd = new Date((startedAt || now).getTime() + 2 * 60_000);
          const pending = await prisma.telephonyCall.findFirst({
            where: {
              orgId: owner.orgId,
              ownerUserId: owner.id,
              provider: 'omicall',
              providerCallId: null,
              direction,
              externalNumber: phoneNumber,
              startedAt: { gte: callWindowStart, lte: callWindowEnd },
            },
            orderBy: { startedAt: 'desc' },
            select: { id: true },
          });
          if (pending) {
            await prisma.telephonyCall.update({
              where: { id: pending.id },
              data: { providerCallId: transactionId, contactId: contact?.id || null, ...callData },
            });
            matched = 1;
          } else {
            await prisma.telephonyCall.create({
              data: {
                orgId: owner.orgId,
                ownerUserId: owner.id,
                contactId: contact?.id || null,
                externalNumber: phoneNumber,
                provider: 'omicall',
                providerCallId: transactionId,
                direction,
                status,
                fromIdentity: direction === 'inbound' ? phoneNumber : extension,
                toIdentity: direction === 'inbound' ? extension : phoneNumber,
                startedAt: startedAt || undefined,
                answeredAt: status === 'answered' || status === 'completed' ? answeredAt || now : undefined,
                endedAt: terminal ? endedAt || now : undefined,
                durationSec: Number.isFinite(billSec) && billSec > 0 ? Math.round(billSec) : undefined,
                recordingId: recordingUrl || undefined,
              },
            });
            matched = 1;
            created = true;
          }
        }
      }
    }

    logger.info({ transactionId, state: body.state, status, matched, created }, '[omicall-webhook] processed');
    return { success: true, matched };
  });
}
