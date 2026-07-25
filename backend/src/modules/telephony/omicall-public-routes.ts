// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config/index.js';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';
import { mapOmicallEventStatus } from './omicall-status.js';

function checkWebhookKey(request: FastifyRequest, reply: FastifyReply): boolean {
  const query = request.query as Record<string, string | undefined>;
  if (!config.omicallWebhookSecret || query.key !== config.omicallWebhookSecret) {
    void reply.status(403).send({ error: 'Sai webhook key' });
    return false;
  }
  return true;
}

export async function omicallPublicRoutes(app: FastifyInstance) {
  app.post('/api/v1/telephony/omicall/events', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkWebhookKey(request, reply)) return;
    const body = (request.body || {}) as Record<string, any>;
    const transactionId = String(body.transaction_id || body.call_uuid || '');
    const status = mapOmicallEventStatus(body);
    if (!transactionId || !status) return { success: true, matched: 0 };

    const now = new Date();
    const terminal = ['completed', 'rejected', 'missed', 'failed'].includes(status);
    const billSec = Number(body.bill_sec ?? 0);
    const result = await prisma.telephonyCall.updateMany({
      where: { providerCallId: transactionId },
      data: {
        status,
        ...(status === 'answered' ? { answeredAt: now } : {}),
        ...(terminal ? { endedAt: now } : {}),
        ...(Number.isFinite(billSec) && billSec > 0 ? { durationSec: Math.round(billSec) } : {}),
        ...(body.recording_file_url ? { recordingId: String(body.recording_file_url) } : {}),
      },
    });

    // Pure inbound (phone -> web) or the agent's browser didn't create a log
    // row in time: no existing row matched this transaction_id — create one
    // from the webhook payload itself.
    if (result.count === 0 && status !== 'initiated') {
      const extension = String(body.extension || '');
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
              answeredAt: status === 'answered' ? now : undefined,
              endedAt: terminal ? now : undefined,
            },
          });
        }
      }
    }

    return { success: true, matched: result.count };
  });
}
