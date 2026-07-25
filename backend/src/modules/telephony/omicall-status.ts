// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * omicall-status.ts — maps an Omicall call-webhook `state` field to our
 * internal TelephonyCall.status enum. `bill_sec` (>0 once the call was
 * actually connected and billed) is the signal that distinguishes a real
 * hangup (completed) from a call that rang out unanswered (missed).
 */
export function mapOmicallEventStatus(body: Record<string, unknown>): string | null {
  const state = String(body.state || '').toLowerCase();
  const billSec = Number(body.bill_sec ?? 0);

  if (state === 'create' || state === 'early') return 'initiated';
  if (state === 'ringing') return 'ringing';
  if (state === 'answered') return 'answered';
  if (state === 'hangup') return billSec > 0 ? 'completed' : 'missed';
  return null;
}
