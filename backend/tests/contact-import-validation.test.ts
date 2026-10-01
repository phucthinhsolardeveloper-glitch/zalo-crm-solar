import { describe, expect, it } from 'vitest';
import {
  resolveImportAddressMigration,
  validateContactImportRow,
} from '../src/modules/contacts/contact-import-service.js';
import { resolveAddressMigration } from '../src/shared/data/address-migration-map.js';
import type { ContactImportRow } from '../src/modules/contacts/contact-import-types.js';

function row(overrides: Partial<ContactImportRow> = {}): ContactImportRow {
  return {
    rowIndex: 1,
    fullName: 'Nguyễn Văn An',
    phone: '0901234567',
    email: null,
    industry: null,
    storeName: null,
    customerType: null,
    importanceLevel: null,
    province: 'TP Hồ Chí Minh',
    district: null,
    ward: null,
    oldProvince: null,
    oldDistrict: null,
    oldWard: null,
    addressLine: null,
    birthDate: null,
    source: null,
    contactStatus: null,
    ...overrides,
  };
}

describe('validateContactImportRow', () => {
  it('accepts province while ward remains optional', () => {
    expect(validateContactImportRow(row())).toMatchObject({ status: 'valid', invalidReason: null });
  });

  it('rejects a row without province', () => {
    expect(validateContactImportRow(row({ province: '  ' }))).toEqual({
      status: 'invalid',
      invalidReason: 'missing_province',
      phoneNormalized: null,
    });
  });

  it('maps a unique old address to the new province and ward', () => {
    expect(resolveAddressMigration({
      oldProvince: 'Thành phố Cần Thơ',
      oldDistrict: 'Huyện Cờ Đỏ',
      oldWard: 'Thị trấn Cờ Đỏ',
    })).toMatchObject({
      status: 'applied',
      new: { province: 'Thành phố Cần Thơ', ward: 'Xã Cờ Đỏ', wardCode: '31261' },
    });
  });

  it('does not guess when the old address has multiple destinations', () => {
    expect(resolveAddressMigration({
      oldProvince: 'Thành phố Cần Thơ',
      oldDistrict: 'Huyện Thới Lai',
      oldWard: 'Xã Tân Thạnh',
    })).toMatchObject({ status: 'ambiguous' });
  });

  it('automatically migrates a legacy 3-tier address from ordinary import columns', () => {
    expect(resolveImportAddressMigration(row({
      province: 'Thành phố Hồ Chí Minh',
      district: 'Quận 1',
      ward: 'Phường Bến Nghé',
    }))).toMatchObject({
      status: 'applied',
      new: { province: 'Thành phố Hồ Chí Minh', ward: 'Phường Sài Gòn', wardCode: '26740' },
    });
  });

  it('keeps current 2-tier province and ward input out of legacy migration', () => {
    expect(resolveImportAddressMigration(row({
      province: 'Thành phố Hồ Chí Minh',
      district: null,
      ward: 'Phường Sài Gòn',
    }))).toMatchObject({ status: 'not_requested' });
  });
});
