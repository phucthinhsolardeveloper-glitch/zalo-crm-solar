// SPDX-License-Identifier: AGPL-3.0-or-later
import { normalizePhone } from '../../shared/utils/phone.js';

/**
 * Canonical scope cho lịch sử note cuộc gọi.
 * Internal/không có số giữ scope theo callId; PSTN/ZCC dùng cùng một phoneKey
 * cho 0xxx, 84xxx và +84xxx.
 */
export function callNotePhoneKey(
  externalNumber: string | null | undefined,
  channel: string | null | undefined,
): string | null {
  if (channel === 'internal') return null;
  return normalizePhone(externalNumber);
}
