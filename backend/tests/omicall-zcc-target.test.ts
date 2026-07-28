// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { firstContactPhone } from '../src/modules/telephony/telephony-routes.js';

describe('firstContactPhone', () => {
  it('ưu tiên số chính và chuẩn hóa về mã quốc gia', () => {
    expect(firstContactPhone({
      phone: '0909 123 456',
      phone2: '0911222333',
      phone3: null,
      phonesExtra: [],
    })).toBe('84909123456');
  });

  it('dùng số phụ hợp lệ khi số chính trống', () => {
    expect(firstContactPhone({
      phone: null,
      phone2: null,
      phone3: null,
      phonesExtra: [{ label: 'Công việc', phone: '+84 912 345 678' }],
    })).toBe('84912345678');
  });

  it('không biến UID hội thoại Zalo cá nhân thành đích gọi ZCC', () => {
    expect(firstContactPhone({
      phone: null,
      phone2: null,
      phone3: null,
      phonesExtra: [{ label: 'UID', phone: '1234567890123456789' }],
    })).toBeNull();
  });
});
