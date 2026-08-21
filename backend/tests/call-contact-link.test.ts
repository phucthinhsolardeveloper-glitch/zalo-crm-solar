import { describe, expect, it } from 'vitest';
import { callContactNumberVariants } from '../src/modules/telephony/call-contact-link.js';

describe('callContactNumberVariants', () => {
  it('bao phủ các dạng provider có thể lưu cho cùng một số Việt Nam', () => {
    expect(callContactNumberVariants('0909 123 456')).toEqual(expect.arrayContaining([
      '0909 123 456',
      '0909123456',
      '84909123456',
      '+84909123456',
      '909123456',
    ]));
  });

  it('không tạo scope giả cho identity không phải số điện thoại', () => {
    expect(callContactNumberVariants('extension:103')).toEqual([]);
  });
});

