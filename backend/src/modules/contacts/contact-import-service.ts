// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * contact-import-service.ts — Validate + dedup + persist cho import Contact
 * từ xlsx/xls/csv (Upload → Column Mapping → Preview → Validation →
 * Duplicate Detection → Import → Result).
 *
 * Cùng nguyên tắc với lists/list-import-service.ts: KHÔNG bao giờ insert mù —
 * mỗi row phải qua validate + dedup trước khi ghi. Trùng SĐT với Contact có sẵn
 * → SKIP (không ghi đè dữ liệu cũ), báo cáo rõ trong result.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { normalizePhone } from '../../shared/utils/phone.js';
import { logger } from '../../shared/utils/logger.js';
import { resolveAddressMigration } from '../../shared/data/address-migration-map.js';
import { resolveProvinceCode, resolveWardCode } from '../../shared/address-kit-client.js';
import type {
  ContactImportRow,
  ContactImportPreviewRow,
  ContactImportPreviewResult,
  ContactImportCommitResult,
  ContactImportInvalidReason,
} from './contact-import-types.js';

/** Validate 1 row (đủ fullName, phone hợp lệ và tỉnh). Không query DB — pure. */
export function validateContactImportRow(row: ContactImportRow): {
  status: 'valid' | 'invalid';
  invalidReason: ContactImportInvalidReason | null;
  phoneNormalized: string | null;
} {
  const fullName = row.fullName?.trim();
  if (!fullName) return { status: 'invalid', invalidReason: 'missing_full_name', phoneNormalized: null };
  const rawPhone = row.phone?.trim();
  if (!rawPhone) return { status: 'invalid', invalidReason: 'missing_phone', phoneNormalized: null };
  const phoneNormalized = normalizePhone(rawPhone);
  if (!phoneNormalized) return { status: 'invalid', invalidReason: 'invalid_phone', phoneNormalized: null };
  if (!row.province?.trim()) return { status: 'invalid', invalidReason: 'missing_province', phoneNormalized: null };
  return { status: 'valid', invalidReason: null, phoneNormalized };
}

function phoneVariantsOf(phoneNormalized: string): string[] {
  return [phoneNormalized, '+' + phoneNormalized, '0' + phoneNormalized.slice(2)];
}

// Nhãn tiếng Việt → slug nội bộ — PHẢI khớp đúng use-contacts.ts STATUS_OPTIONS/
// CUSTOMER_TYPE_OPTIONS (frontend). File Excel thường có nhãn hiển thị ("Đã mua hàng"),
// không phải slug ("purchased") — map về đúng slug để dropdown CRM nhận diện được;
// nếu không khớp nhãn nào, chấp nhận slug gõ tay hoặc giữ nguyên text gốc (không bịa,
// không âm thầm bỏ dữ liệu — sale tự sửa lại bằng tay sau nếu cần).
const STATUS_LABEL_TO_SLUG: Record<string, string> = {
  'mới': 'new', 'đã liên hệ': 'contacted', 'quan tâm': 'interested', 'báo giá': 'quoted',
  'đang follow': 'following', 'chốt đơn': 'closed_won', 'không tiềm năng': 'not_potential',
  'chuyển sale': 'transferred', 'đã mua hàng': 'purchased', 'ngừng kinh doanh': 'discontinued',
};
const CUSTOMER_TYPE_LABEL_TO_SLUG: Record<string, string> = {
  'đại lý': 'agent', 'dự án': 'project', 'cá nhân': 'individual',
};
const IMPORTANCE_LABEL_TO_SLUG: Record<string, string> = {
  'thấp': 'low', 'bình thường': 'normal', 'quan trọng': 'high', 'rất quan trọng': 'critical',
};
const VALID_STATUS_SLUGS = new Set(Object.values(STATUS_LABEL_TO_SLUG));
const VALID_CUSTOMER_TYPE_SLUGS = new Set(Object.values(CUSTOMER_TYPE_LABEL_TO_SLUG));
const VALID_IMPORTANCE_SLUGS = new Set(Object.values(IMPORTANCE_LABEL_TO_SLUG));

function mapLabelToSlug(raw: string | null, labelMap: Record<string, string>, validSlugs: Set<string>): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (validSlugs.has(lower)) return lower; // đã là slug đúng
  const bySlug = validSlugs.has(trimmed) ? trimmed : null;
  if (bySlug) return bySlug;
  return labelMap[lower] ?? trimmed; // khớp nhãn → slug; không khớp → giữ nguyên text gốc
}

/**
 * Parse ngày sinh — chấp nhận ISO (frontend đã convert cell Date→"YYYY-MM-DD") VÀ
 * dd/mm/yyyy hoặc dd-mm-yyyy (phổ biến khi user gõ tay vào CSV thay vì ô Date thật của
 * Excel). new Date() thô sẽ parse sai/silent-invalid với dd/mm/yyyy (JS đọc kiểu Mỹ
 * mm/dd/yyyy) — thà bỏ trống còn hơn lưu nhầm ngày (theo đúng nguyên tắc birthDate đã
 * thống nhất trước đó: không suy đoán, không bịa dữ liệu).
 */
function parseImportBirthDate(raw: string | null): Date | null {
  if (!raw) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      // Guard tràn ngày (vd 31/02) — Date tự cuộn sang tháng sau, phát hiện qua so lại.
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day) return d;
    }
    return null;
  }
  return null;
}

/**
 * Validate tất cả rows + phát hiện trùng (trùng Contact CRM có sẵn VÀ trùng nội bộ
 * trong cùng file import — 2 dòng cùng SĐT trong 1 lần upload). 1 query batch, không N+1.
 */
export async function previewContactImport(
  rows: ContactImportRow[],
  orgId: string,
): Promise<ContactImportPreviewResult> {
  const prepared = rows.map((row) => {
    const addressMigration = resolveAddressMigration(row);
    const migratedRow = addressMigration.status === 'applied' && addressMigration.new
      ? { ...row, province: addressMigration.new.province, district: null, ward: addressMigration.new.ward }
      : row;
    return { row: migratedRow, addressMigration };
  });
  const validated = prepared.map(({ row, addressMigration }) => {
    const base = validateContactImportRow(row);
    const migrationReason: ContactImportInvalidReason | null = addressMigration.status === 'incomplete'
      ? 'address_mapping_incomplete'
      : addressMigration.status === 'not_found'
        ? 'address_mapping_not_found'
        : addressMigration.status === 'ambiguous'
          ? 'address_mapping_ambiguous'
          : null;
    return {
      row,
      addressMigration,
      status: migrationReason ? 'invalid' as const : base.status,
      invalidReason: migrationReason || base.invalidReason,
      phoneNormalized: base.phoneNormalized,
    };
  });

  const normalizedPhones = validated
    .filter((v) => v.status === 'valid' && v.phoneNormalized)
    .map((v) => v.phoneNormalized!);

  const existingByPhone = new Map<string, { id: string; name: string | null }>();
  if (normalizedPhones.length) {
    const variantSet = new Set<string>();
    for (const p of normalizedPhones) for (const v of phoneVariantsOf(p)) variantSet.add(v);
    const existing = await prisma.contact.findMany({
      where: {
        orgId,
        mergedInto: null,
        OR: [
          { phoneNormalized: { in: normalizedPhones } },
          { phone: { in: [...variantSet] } },
          { phone2: { in: [...variantSet] } },
          { phone3: { in: [...variantSet] } },
        ],
      },
      select: { id: true, fullName: true, crmName: true, phone: true, phone2: true, phone3: true, phoneNormalized: true },
    });
    for (const c of existing) {
      const name = c.crmName || c.fullName;
      for (const p of [c.phoneNormalized, c.phone, c.phone2, c.phone3]) {
        if (!p) continue;
        const norm = normalizePhone(p);
        if (norm) existingByPhone.set(norm, { id: c.id, name });
      }
    }
  }

  // Trùng nội bộ file — dòng SAU trùng SĐT với dòng TRƯỚC (dòng đầu coi là "gốc", giữ valid;
  // dòng lặp lại bị đánh duplicate để KHÔNG tạo 2 Contact giống nhau từ cùng 1 file).
  const seenInBatch = new Set<string>();

  const outRows: ContactImportPreviewRow[] = validated.map(({ row, addressMigration, status, invalidReason, phoneNormalized }) => {
    if (status === 'invalid') {
      return { ...row, status: 'invalid', invalidReason, phoneNormalized: null, duplicateContactId: null, duplicateContactName: null, addressMigration };
    }
    const existing = existingByPhone.get(phoneNormalized!);
    if (existing) {
      return { ...row, status: 'duplicate', invalidReason: null, phoneNormalized, duplicateContactId: existing.id, duplicateContactName: existing.name, addressMigration };
    }
    if (seenInBatch.has(phoneNormalized!)) {
      return { ...row, status: 'duplicate', invalidReason: null, phoneNormalized, duplicateContactId: null, duplicateContactName: 'Trùng SĐT với dòng khác trong cùng file', addressMigration };
    }
    seenInBatch.add(phoneNormalized!);
    return { ...row, status: 'valid', invalidReason: null, phoneNormalized, duplicateContactId: null, duplicateContactName: null, addressMigration };
  });

  return {
    total: outRows.length,
    valid: outRows.filter((r) => r.status === 'valid').length,
    invalid: outRows.filter((r) => r.status === 'invalid').length,
    duplicate: outRows.filter((r) => r.status === 'duplicate').length,
    rows: outRows,
  };
}

/**
 * Ghi thật — re-validate + re-dedup ngay tại đây (KHÔNG tin trạng thái preview client
 * gửi lên, tránh race condition giữa preview và commit hoặc payload bị sửa tay).
 * Mỗi row insert riêng (không 1 transaction chung) — 1 row lỗi không chặn cả file,
 * lỗi được gom vào errors[] thay vì rollback toàn bộ.
 */
interface ResolvedAddress2Tier {
  provinceCode: string | null;
  provinceName: string | null;
  wardCode: string | null;
  wardName: string | null;
}

/**
 * Mục E (2026-09-30): resolve địa chỉ 2 cấp cho 1 row import.
 * - Nếu đã map từ địa chỉ cũ (addressMigration.status='applied'): CSV sáp nhập
 *   đã cho sẵn wardCode chính thức — dùng luôn, không gọi address-kit cho xã.
 * - Nếu nhập trực tiếp địa chỉ mới (không qua migration): resolve wardCode
 *   bằng cách khớp tên trong danh sách xã chính thức theo tỉnh.
 * Không đoán khi không khớp — để wardCode null, vẫn giữ tên xã user nhập
 * (ward không bắt buộc, khác province).
 */
async function resolveAddress2Tier(row: ContactImportPreviewRow): Promise<ResolvedAddress2Tier> {
  const migration = row.addressMigration;
  const provinceName = migration.status === 'applied' ? migration.new!.province : row.province?.trim() || null;
  const wardNameInput = migration.status === 'applied' ? migration.new!.ward : row.ward?.trim() || null;

  if (!provinceName) return { provinceCode: null, provinceName: null, wardCode: null, wardName: null };

  let provinceCode: string | null = null;
  try {
    provinceCode = await resolveProvinceCode(provinceName);
  } catch (err) {
    logger.warn(`[contact-import] resolveProvinceCode failed for "${provinceName}":`, err);
  }

  if (migration.status === 'applied') {
    return { provinceCode, provinceName, wardCode: migration.new!.wardCode || null, wardName: wardNameInput };
  }
  if (!wardNameInput || !provinceCode) {
    return { provinceCode, provinceName, wardCode: null, wardName: wardNameInput };
  }
  try {
    const wardCode = await resolveWardCode(provinceCode, wardNameInput);
    return { provinceCode, provinceName, wardCode, wardName: wardNameInput };
  } catch (err) {
    logger.warn(`[contact-import] resolveWardCode failed for province=${provinceCode}:`, err);
    return { provinceCode, provinceName, wardCode: null, wardName: wardNameInput };
  }
}

export async function commitContactImport(
  rows: ContactImportRow[],
  orgId: string,
  userId: string,
): Promise<ContactImportCommitResult> {
  const preview = await previewContactImport(rows, orgId);
  const result: ContactImportCommitResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

  for (const row of preview.rows) {
    if (row.status !== 'valid') {
      result.skipped++;
      continue;
    }
    try {
      const contactId = randomUUID();
      const addr2 = await resolveAddress2Tier(row);
      await prisma.$transaction([
        prisma.contact.create({
          data: {
            id: contactId,
            orgId,
            fullName: row.fullName!.trim(),
            phone: row.phone!.trim(),
            phoneNormalized: row.phoneNormalized,
            email: row.email?.trim() || null,
            industry: row.industry?.trim() || null,
            storeName: row.storeName?.trim() || null,
            customerType: mapLabelToSlug(row.customerType, CUSTOMER_TYPE_LABEL_TO_SLUG, VALID_CUSTOMER_TYPE_SLUGS),
            importanceLevel: mapLabelToSlug(row.importanceLevel, IMPORTANCE_LABEL_TO_SLUG, VALID_IMPORTANCE_SLUGS),
            // Mục E (2026-09-30): địa chỉ ghi vào field 2 cấp mới, KHÔNG ghi
            // province/district/ward legacy nữa (giữ đọc lịch sử, không ghi mới).
            addressProvinceCode: addr2.provinceCode,
            addressProvinceName: addr2.provinceName,
            addressWardCode: addr2.wardCode,
            addressWardName: addr2.wardName,
            addressStreet: row.addressLine?.trim() || null,
            birthDate: parseImportBirthDate(row.birthDate),
            source: row.source?.trim() || 'import',
            status: mapLabelToSlug(row.contactStatus, STATUS_LABEL_TO_SLUG, VALID_STATUS_SLUGS) || 'new',
            hasZalo: null,
            assignedUserId: userId,
            tags: [],
            metadata: row.addressMigration.status === 'applied'
              ? { addressMigration: row.addressMigration }
              : {},
          },
        }),
        prisma.contactAccess.create({
          data: { orgId, contactId, userId, role: 'primary', source: 'import' },
        }),
      ]);
      result.imported++;
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ rowIndex: row.rowIndex, error: message });
      logger.warn(`[contact-import] row ${row.rowIndex} failed: ${message}`);
    }
  }

  return result;
}
