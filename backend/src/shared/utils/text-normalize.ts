// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * stripVietnameseDiacritics — chuẩn hoá tên tiếng Việt: bỏ dấu + lowercase.
 * Dùng để tìm kiếm không cần gõ dấu (Contact.fullNameNoAccent/crmNameNoAccent).
 * NFD decompose xử lý được hầu hết dấu (á → a + combining acute U+0301), riêng
 * đ/Đ là ký tự Unicode độc lập (không decompose qua NFD) nên phải replace tay.
 */
export function stripVietnameseDiacritics(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
