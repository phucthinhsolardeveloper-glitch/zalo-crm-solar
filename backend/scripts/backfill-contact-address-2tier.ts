// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Backfill Contact.province/district/ward (legacy 3 cấp) → addressProvinceCode/
 * Name, addressWardCode/Name (2 cấp, mục E 2026-09-30).
 *
 * Hai nhánh xử lý mỗi contact có `province`:
 *   - Có `district` (dữ liệu 3 cấp thật, trước sáp nhập) → resolveAddressMigration
 *     (bảng CSV sáp nhập) lấy tên tỉnh/xã MỚI + wardCode chính thức có sẵn.
 *   - Không có `district` (đã là địa chỉ 2 cấp nhập trực tiếp, chỉ thiếu mã) →
 *     resolve thẳng qua address-kit (khớp tên).
 * Không khớp được (CSV not_found/ambiguous, hoặc tên tỉnh lạ với address-kit) →
 * ghi vào file review, KHÔNG tự đoán, KHÔNG ghi đè province cũ.
 *
 * Safe rollout: dry-run mặc định, --apply mới ghi. Backup DB trước khi --apply
 * (bắt buộc theo AGENTS.md).
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '../src/shared/database/prisma-client.js';
import { runSystemQuery } from '../src/shared/tenant/tenant-context.js';
import { resolveAddressMigration } from '../src/shared/data/address-migration-map.js';
import { resolveProvinceCode, resolveWardCode } from '../src/shared/address-kit-client.js';

interface Plan {
  id: string;
  addressProvinceCode: string | null;
  addressProvinceName: string;
  addressWardCode: string | null;
  addressWardName: string | null;
}

interface ReviewEntry {
  id: string;
  reason: string;
  old: { province: string | null; district: string | null; ward: string | null };
}

async function loadCandidates() {
  return runSystemQuery(() => prisma.contact.findMany({
    where: { province: { not: null } },
    select: { id: true, province: true, district: true, ward: true },
  }));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const contacts = await loadCandidates();

  const plans: Plan[] = [];
  const review: ReviewEntry[] = [];

  for (const c of contacts) {
    const province = c.province!.trim();
    const district = c.district?.trim() || null;
    const ward = c.ward?.trim() || null;

    if (district) {
      // Nhánh 1: địa chỉ 3 cấp thật → tra CSV sáp nhập.
      const migration = resolveAddressMigration({ oldProvince: province, oldDistrict: district, oldWard: ward });
      if (migration.status !== 'applied') {
        review.push({ id: c.id, reason: `csv_${migration.status}`, old: { province, district, ward } });
        continue;
      }
      const provinceCode = await resolveProvinceCode(migration.new!.province);
      if (!provinceCode) {
        review.push({ id: c.id, reason: 'province_code_not_found_after_csv', old: { province, district, ward } });
        continue;
      }
      plans.push({
        id: c.id,
        addressProvinceCode: provinceCode,
        addressProvinceName: migration.new!.province,
        addressWardCode: migration.new!.wardCode || null,
        addressWardName: migration.new!.ward,
      });
      continue;
    }

    // Nhánh 2: không có district → coi như đã nhập theo địa chỉ mới, chỉ thiếu mã.
    const provinceCode = await resolveProvinceCode(province);
    if (!provinceCode) {
      review.push({ id: c.id, reason: 'province_code_not_found', old: { province, district, ward } });
      continue;
    }
    let wardCode: string | null = null;
    if (ward) {
      wardCode = await resolveWardCode(provinceCode, ward);
      if (!wardCode) {
        // Ward không khớp vẫn ghi được — chỉ province là bắt buộc theo nghiệp vụ (họp 25/08).
        review.push({ id: c.id, reason: 'ward_code_not_found', old: { province, district, ward } });
      }
    }
    plans.push({
      id: c.id,
      addressProvinceCode: provinceCode,
      addressProvinceName: province,
      addressWardCode: wardCode,
      addressWardName: ward,
    });
  }

  console.log(`[backfill-address] total_candidates=${contacts.length} resolved=${plans.length} review=${review.length} mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

  if (review.length > 0) {
    const reviewFile = `backfill-address-review-${new Date().toISOString().slice(0, 10)}.json`;
    writeFileSync(reviewFile, JSON.stringify(review, null, 2));
    console.log(`[backfill-address] ${review.length} contact cần xem tay → ${reviewFile}`);
  }

  if (!apply) {
    for (const p of plans) {
      console.log(`  would set contact=${p.id} → province="${p.addressProvinceName}"(${p.addressProvinceCode}) ward="${p.addressWardName ?? ''}"(${p.addressWardCode ?? '-'})`);
    }
    return;
  }

  let applied = 0;
  for (const p of plans) {
    await runSystemQuery(() => prisma.contact.update({
      where: { id: p.id },
      data: {
        addressProvinceCode: p.addressProvinceCode,
        addressProvinceName: p.addressProvinceName,
        addressWardCode: p.addressWardCode,
        addressWardName: p.addressWardName,
      },
    }));
    applied++;
  }
  console.log(`[backfill-address] applied=${applied}`);
}

main()
  .catch((err) => {
    console.error('[backfill-address] FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
