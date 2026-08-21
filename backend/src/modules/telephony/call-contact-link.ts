// SPDX-License-Identifier: AGPL-3.0-or-later
import { normalizePhone, phoneVariants } from '../../shared/utils/phone.js';

/**
 * Các dạng số có thể đã được provider/legacy history lưu trong externalNumber.
 * Dùng khi gắn một cuộc gọi vào KH để những lần gọi cùng đầu số không còn bị rời rạc.
 */
export function callContactNumberVariants(input: string | null | undefined): string[] {
  const canonical = normalizePhone(input);
  if (!canonical) return [];

  const variants = new Set(phoneVariants(canonical));
  const raw = String(input || '').trim();
  const digits = raw.replace(/[^\d]/g, '');
  if (raw) variants.add(raw);
  if (digits) variants.add(digits);
  if (canonical.startsWith('84')) variants.add(canonical.slice(2));
  return [...variants];
}

