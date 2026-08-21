import { describe, expect, it } from 'vitest';
import { callNotePhoneKey } from '../src/modules/telephony/call-note-scope.js';

describe('callNotePhoneKey', () => {
  it.each([
    ['0909 123 456', '84909123456'],
    ['+84 909 123 456', '84909123456'],
    ['84909123456', '84909123456'],
    ['909123456', '84909123456'],
  ])('gom các định dạng của cùng đầu số %s', (input, expected) => {
    expect(callNotePhoneKey(input, 'pstn')).toBe(expected);
  });

  it('không gom cuộc gọi nội bộ theo identity giả', () => {
    expect(callNotePhoneKey('extension:103', 'internal')).toBeNull();
  });
});
