// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
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
      const seconds = Number(value);
      return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined;
    };
    const now = new Date();
    const answeredAt = eventDate(body.time_start_to_answer);
    const endedAt = eventDate(body.time_end_call);
    const terminal = ['completed', 'rejected', 'missed', 'failed'].includes(status);
    const billSec = Number(body.bill_sec ?? 0);
    const result = await prisma.telephonyCall.updateMany({
      where: { providerCallId: transactionId },
      data: {
        status,
        ...(status === 'answered' ? { answeredAt: answeredAt || now } : {}),
        ...(status === 'completed' && answeredAt ? { answeredAt } : {}),
        ...(terminal ? { endedAt: endedAt || now } : {}),
        ...(Number.isFinite(billSec) && billSec > 0 ? { durationSec: Math.round(billSec) } : {}),
        ...(body.recording_file_url ? { recordingId: String(body.recording_file_url) } : {}),
      },
    });

    // Pure inbound (phone -> web) or the agent's browser didn't create a log
    // row in time: no existing row matched this transaction_id — create one
    // from the webhook payload itself.
    if (result.count === 0 && status !== 'initiated') {
      const usersStatus = Array.isArray(body.users_status)
        ? body.users_status
        : Array.isArray(body.user_status)
          ? body.user_status
          : [];
      const answeredUser = usersStatus.find((item: any) => Number(item?.answer_at) > 0);
      const extension = String(body.extension || body.sip_user || answeredUser?.extension || '');
      const phoneNumber = normalizePhone(String(body.phone_number || ''));
      const direction = String(body.direction || '') === 'outbound' ? 'outbound' : 'inbound';
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
              answeredAt: status === 'answered' || status === 'completed' ? answeredAt || now : undefined,
              endedAt: terminal ? endedAt || now : undefined,
              durationSec: Number.isFinite(billSec) && billSec > 0 ? Math.round(billSec) : undefined,
              recordingId: body.recording_file_url ? String(body.recording_file_url) : undefined,
            },
          });
        }
      }
    }

    return { success: true, matched: result.count };
  });
}
