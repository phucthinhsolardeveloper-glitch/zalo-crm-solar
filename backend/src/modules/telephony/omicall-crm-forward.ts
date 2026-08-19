// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * omicall-crm-forward.ts — relay a completed OmiCall call event to crm-custom's
 * webhook-endpoints receiver, so the same call also lands in crm-custom's
 * CallLog (Lead status automation + AI summary). crm-custom's receiver accepts
 * the raw OmiCall CDR field names (call_uuid, phone_number, sip_user, state...)
 * directly — no transformation needed, forward the body mostly as-is.
 *
 * Optional: no-op if CRM_CUSTOM_OMICALL_WEBHOOK_URL isn't configured, same
 * disable-if-missing-env pattern used across this integration.
 *
 * Fire-and-forget — same pattern as emitWebhook() (modules/api/webhook-service.ts):
 * never block the caller (the OmiCall webhook handler) on crm-custom's response.
 */
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';

export function forwardCallToCrm(body: Record<string, unknown>): void {
  if (!config.crmCustomOmicallWebhookUrl) return;

  const callId = body.call_uuid ?? body.transaction_id;

  fetch(config.crmCustomOmicallWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': config.crmCustomOmicallWebhookSecret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn(`[omicall-crm-forward] crm-custom returned ${res.status} for call_uuid=${callId}`);
      }
    })
    .catch((err) => {
      logger.warn(`[omicall-crm-forward] Failed to forward call_uuid=${callId} to crm-custom: ${err instanceof Error ? err.message : String(err)}`);
    });
}
