// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { normalizeAddressSearch, resolveProvinceName, wardsForProvince } from './address-suggestion-utils';

const provinces = ['Đà Nẵng', 'Gia Lai'];
const wardsByProvince = {
  'Đà Nẵng': ['Xã Đắc Pring', 'Xã Hòa Vang'],
  'Gia Lai': ['Xã Đak Đoa', 'Xã Đak Pơ', 'Xã Ia Grai'],
  __unmatched__: ['Xã Không rõ tỉnh'],
};

describe('address suggestions', () => {
  it('tìm tỉnh không phân biệt dấu và hoa thường', () => {
    expect(normalizeAddressSearch('Gia')).toBe('gia');
    expect(resolveProvinceName('gia lai', provinces)).toBe('Gia Lai');
    expect(resolveProvinceName('Tỉnh GIA LAI', provinces)).toBe('Gia Lai');
  });

  it('chỉ trả xã thuộc đúng tỉnh đã chọn', () => {
    expect(wardsForProvince('Gia Lai', provinces, wardsByProvince)).toEqual([
      'Xã Đak Đoa', 'Xã Đak Pơ', 'Xã Ia Grai',
    ]);
    expect(wardsForProvince('Gia Lai', provinces, wardsByProvince)).not.toContain('Xã Đắc Pring');
  });

  it('không gộp xã toàn quốc khi tỉnh mới gõ dở hoặc không khớp', () => {
    expect(wardsForProvince('gia', provinces, wardsByProvince)).toEqual([]);
    expect(wardsForProvince('', provinces, wardsByProvince)).toEqual([]);
    expect(wardsForProvince('không tồn tại', provinces, wardsByProvince)).toEqual([]);
  });

  it('tìm được Đak/Đăk khi người dùng gõ đa hoặc da', () => {
    const wards = wardsForProvince('Gia Lai', provinces, wardsByProvince);
    expect(wards.filter((ward) => normalizeAddressSearch(ward).includes(normalizeAddressSearch('đa'))))
      .toEqual(['Xã Đak Đoa', 'Xã Đak Pơ']);
    expect(wards.filter((ward) => normalizeAddressSearch(ward).includes(normalizeAddressSearch('da'))))
      .toEqual(['Xã Đak Đoa', 'Xã Đak Pơ']);
  });
});
