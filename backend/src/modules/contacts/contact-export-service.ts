// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * contact-export-service.ts — Xuất Contact ra .xlsx/.csv với ĐÚNG field/label/enum
 * như contact-import-service.ts (TARGET_FIELDS ở ContactImportDialog.vue) — để file
 * xuất ra import ngược lại được không mất dữ liệu (round-trip).
 */
import ExcelJS from 'exceljs';

// Đảo ngược STATUS_LABEL_TO_SLUG/CUSTOMER_TYPE_LABEL_TO_SLUG (contact-import-service.ts) —
// PHẢI khớp đúng text hiển thị ở STATUS_OPTIONS/CUSTOMER_TYPE_OPTIONS (use-contacts.ts).
const STATUS_SLUG_TO_LABEL: Record<string, string> = {
  new: 'Mới', contacted: 'Đã liên hệ', interested: 'Quan tâm', quoted: 'Báo giá',
  following: 'Đang follow', closed_won: 'Chốt đơn', not_potential: 'Không tiềm năng',
  transferred: 'Chuyển sale', purchased: 'Đã mua hàng', discontinued: 'Ngừng kinh doanh',
};
const CUSTOMER_TYPE_SLUG_TO_LABEL: Record<string, string> = {
  agent: 'Đại lý', project: 'Dự án', individual: 'Cá nhân',
};

// Cùng thứ tự + label với TARGET_FIELDS (ContactImportDialog.vue) TRỪ dấu "*" bắt buộc
// (chỉ có ý nghĩa lúc mapping cột lúc import, không cần khi xuất) — regex HEADER_GUESSES
// vẫn nhận diện đúng các header này khi import lại.
export const EXPORT_COLUMNS = [
  { key: 'fullName', label: 'Họ tên' },
  { key: 'phone', label: 'SĐT' },
  { key: 'email', label: 'Email' },
  { key: 'industry', label: 'Ngành nghề' },
  { key: 'storeName', label: 'Tên cửa hàng' },
  { key: 'customerType', label: 'Đối tượng' },
  { key: 'province', label: 'Tỉnh/Thành phố' },
  { key: 'district', label: 'Quận/Huyện' },
  { key: 'ward', label: 'Phường/Xã' },
  { key: 'addressLine', label: 'Địa chỉ chi tiết' },
  { key: 'birthDate', label: 'Ngày sinh' },
  { key: 'source', label: 'Nguồn' },
  { key: 'status', label: 'Trạng thái' },
] as const;
type ExportKey = typeof EXPORT_COLUMNS[number]['key'];

export interface ExportableContact {
  fullName: string | null;
  phone: string | null;
  email: string | null;
  industry: string | null;
  storeName: string | null;
  customerType: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  addressLine: string | null;
  birthDate: Date | null;
  source: string | null;
  status: string | null;
}

// Xuất NGUYÊN field fullName (không phải crmName) — khớp field mà contact-import-service.ts
// GHI vào lúc import → xuất ra rồi import lại không lệch dữ liệu (round-trip fidelity, theo
// đúng yêu cầu audit import/export).
function toRow(c: ExportableContact): Record<ExportKey, string> {
  return {
    fullName: c.fullName ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    industry: c.industry ?? '',
    storeName: c.storeName ?? '',
    customerType: c.customerType ? (CUSTOMER_TYPE_SLUG_TO_LABEL[c.customerType] ?? c.customerType) : '',
    province: c.province ?? '',
    district: c.district ?? '',
    ward: c.ward ?? '',
    addressLine: c.addressLine ?? '',
    // ISO yyyy-mm-dd — cùng format parseImportBirthDate() chấp nhận lúc import lại.
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : '',
    source: c.source ?? '',
    status: c.status ? (STATUS_SLUG_TO_LABEL[c.status] ?? c.status) : '',
  };
}

// RFC4180 quoting — cùng quy tắc mà parseCsvText() (use-spreadsheet-parser.ts, FE) đọc lại:
// quote field chứa dấu phẩy/ngoặc kép/xuống dòng, escape "" cho ngoặc kép bên trong.
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function buildContactsCsv(contacts: ExportableContact[]): string {
  const header = EXPORT_COLUMNS.map((c) => csvField(c.label)).join(',');
  const lines = contacts.map((c) => {
    const row = toRow(c);
    return EXPORT_COLUMNS.map((col) => csvField(row[col.key])).join(',');
  });
  // BOM UTF-8 — Excel mở CSV tiếng Việt đúng dấu; parseCsvText() (FE) đã tự strip BOM khi đọc lại.
  return '﻿' + [header, ...lines].join('\r\n');
}

export async function buildContactsXlsx(contacts: ExportableContact[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Khách hàng');
  sheet.columns = EXPORT_COLUMNS.map((c) => ({ header: c.label, key: c.key, width: 20 }));
  for (const c of contacts) sheet.addRow(toRow(c));
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
