// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Bảng ánh xạ địa giới trước/sau sáp nhập từ vietnam-sap-nhap-phuong-xa.csv.
 *
 * Không đoán khi một đơn vị cũ có nhiều đích mới: caller phải đưa row về trạng
 * thái review để người dùng bổ sung thông tin, tránh ghi sai địa chỉ khách hàng.
 */
import { readFileSync } from 'node:fs';
import type {
  ContactImportAddressMigration,
  ContactImportRow,
} from '../../modules/contacts/contact-import-types.js';

interface AddressMappingEntry {
  oldWard: string;
  oldDistrict: string;
  oldProvince: string;
  newProvince: string;
  newWard: string;
  newUnitType: string;
  newWardCode: string;
}

const SOURCE_URL = new URL('./vietnam-sap-nhap-phuong-xa.csv', import.meta.url);
let mappingIndex: Map<string, AddressMappingEntry[]> | null = null;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function normalizePart(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function keyOf(oldProvince: string, oldDistrict: string, oldWard: string): string {
  return [oldProvince, oldDistrict, oldWard].map(normalizePart).join('|');
}

function getIndex(): Map<string, AddressMappingEntry[]> {
  if (mappingIndex) return mappingIndex;
  const text = readFileSync(SOURCE_URL, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const index = new Map<string, AddressMappingEntry[]>();
  for (const line of lines.slice(1)) {
    const [oldWard, oldDistrict, oldProvince, newProvince, newWard, newUnitType, newWardCode] = parseCsvLine(line);
    if (!oldWard || !oldDistrict || !oldProvince || !newProvince || !newWard) continue;
    const entry = { oldWard, oldDistrict, oldProvince, newProvince, newWard, newUnitType, newWardCode };
    const key = keyOf(oldProvince, oldDistrict, oldWard);
    const rows = index.get(key) || [];
    rows.push(entry);
    index.set(key, rows);
  }
  mappingIndex = index;
  return index;
}

export function resolveAddressMigration(row: Pick<ContactImportRow, 'oldProvince' | 'oldDistrict' | 'oldWard'>): ContactImportAddressMigration {
  const old = {
    province: row.oldProvince?.trim() || null,
    district: row.oldDistrict?.trim() || null,
    ward: row.oldWard?.trim() || null,
  };
  const supplied = Object.values(old).some(Boolean);
  if (!supplied) return { status: 'not_requested', old };
  if (!old.province || !old.district || !old.ward) return { status: 'incomplete', old };

  const matches = getIndex().get(keyOf(old.province, old.district, old.ward)) || [];
  if (!matches.length) return { status: 'not_found', old };
  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      old,
      candidates: matches.map((entry) => ({ province: entry.newProvince, ward: entry.newWard, unitType: entry.newUnitType, wardCode: entry.newWardCode })),
    };
  }
  const match = matches[0];
  return {
    status: 'applied',
    old,
    new: { province: match.newProvince, ward: match.newWard, unitType: match.newUnitType, wardCode: match.newWardCode },
  };
}
