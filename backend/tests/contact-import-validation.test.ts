import { describe, expect, it } from 'vitest';
import { validateContactImportRow } from '../src/modules/contacts/contact-import-service.js';
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
});
