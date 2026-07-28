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
  // Omicall sends both realtime `hangup` events and a final `cdr` payload.
  // The CDR is the payload that includes the authoritative duration and
  // recording_file_url, so it must also be treated as a terminal state.
  if (state === 'hangup' || state === 'cdr') {
    const answerSec = Number(body.answer_sec ?? 0);
    return billSec > 0 || answerSec > 0 ? 'completed' : 'missed';
  }
  return null;
}
