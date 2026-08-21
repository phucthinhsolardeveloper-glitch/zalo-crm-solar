// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * contact-import-types.ts — Types cho import Contact từ xlsx/xls/csv.
 * Cùng pattern với lists/types.ts (list-import) nhưng map đủ field Contact
 * thay vì chỉ phone/name/note.
 */

export interface ContactImportRow {
  rowIndex: number;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  storeName: string | null;
  customerType: string | null;
  importanceLevel: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  addressLine: string | null;
  // YYYY-MM-DD hoặc chuỗi ngày Excel serial đã convert phía frontend.
  birthDate: string | null;
  source: string | null;
  // Nhãn tiếng Việt (vd "Đã mua hàng") HOẶC slug (vd "purchased") — service tự map.
  // Đặt tên "contactStatus" (không phải "status") để KHÔNG đụng field "status" ở
  // ContactImportPreviewRow bên dưới (validation status valid/invalid/duplicate) — trước
  // đây trùng tên khiến "status" của preview row (vd "valid") ghi đè mất status Contact
  // gốc mà user nhập ("Đã mua hàng"), lưu nhầm literal "valid" vào Contact.status.
  contactStatus: string | null;
}

export type ContactImportRowStatus = 'valid' | 'invalid' | 'duplicate';

export type ContactImportInvalidReason =
  | 'missing_full_name'
  | 'missing_phone'
  | 'invalid_phone';

export interface ContactImportPreviewRow extends ContactImportRow {
  status: ContactImportRowStatus;
  invalidReason: ContactImportInvalidReason | null;
  phoneNormalized: string | null;
  // Khi status='duplicate' — Contact hiện có khớp SĐT này.
  duplicateContactId: string | null;
  duplicateContactName: string | null;
}

export interface ContactImportPreviewResult {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  rows: ContactImportPreviewRow[];
}

export interface ContactImportCommitResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{ rowIndex: number; error: string }>;
}
