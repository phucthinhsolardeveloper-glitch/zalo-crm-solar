// SPDX-License-Identifier: AGPL-3.0-or-later

/** Chuẩn hóa chuỗi tìm kiếm tiếng Việt, kể cả ký tự đ/Đ không tách bởi NFD. */
export function normalizeAddressSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeProvince(value: string): string {
  return normalizeAddressSearch(value)
    .replace(/^(tinh|thanh pho|tp)\s+/, '')
    .trim();
}

/**
 * Chỉ coi tỉnh là đã chọn khi giá trị nhập khớp trọn vẹn một tỉnh/thành.
 * So khớp không phân biệt hoa/thường, dấu và tiền tố Tỉnh/TP.
 */
export function resolveProvinceName(
  input: string | null | undefined,
  provinces: readonly string[],
): string | null {
  const normalizedInput = normalizeProvince(input || '');
  if (!normalizedInput) return null;
  return provinces.find((province) => normalizeProvince(province) === normalizedInput) || null;
}

/** Không có tỉnh hợp lệ thì không trả xã; tuyệt đối không gộp xã của toàn quốc. */
export function wardsForProvince(
  input: string | null | undefined,
  provinces: readonly string[],
  wardsByProvince: Readonly<Record<string, readonly string[]>>,
): string[] {
  const resolved = resolveProvinceName(input, provinces);
  return resolved ? [...(wardsByProvince[resolved] || [])] : [];
}
