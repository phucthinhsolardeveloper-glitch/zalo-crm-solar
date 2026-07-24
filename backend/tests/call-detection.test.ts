import { describe, it, expect } from 'vitest';
import { parseCallDetails } from '../src/modules/calls/call-detection.js';

describe('parseCallDetails — shape action/params (recommened.calltime/misscall)', () => {
  it('KH gọi, kết nối 39s → inbound/voice/connected', () => {
    const content = { action: 'recommened.calltime', params: JSON.stringify({ duration: 39, isCaller: 0 }) };
    expect(parseCallDetails(content)).toEqual({
      direction: 'inbound', callType: 'voice', isMissed: false, durationSec: 39,
    });
  });

  it('sale gọi, kết nối 120s → outbound/voice/connected', () => {
    const content = { action: 'recommened.calltime', params: JSON.stringify({ duration: 120, isCaller: 1 }) };
    expect(parseCallDetails(content)).toEqual({
      direction: 'outbound', callType: 'voice', isMissed: false, durationSec: 120,
    });
  });

  it('action chứa misscall → missed bất kể duration', () => {
    const content = { action: 'recommened.misscall', params: JSON.stringify({ duration: 0, isCaller: 0 }) };
    expect(parseCallDetails(content)).toEqual({
      direction: 'inbound', callType: 'voice', isMissed: true, durationSec: 0,
    });
  });

  it('duration=0 không kèm misscall → vẫn tính missed', () => {
    const content = { action: 'recommended.calltime', params: JSON.stringify({ duration: 0, isCaller: 1 }) };
    expect(parseCallDetails(content)?.isMissed).toBe(true);
  });

  it('params là object (không phải JSON string) vẫn đọc được', () => {
    const content = { action: 'recommened.calltime', params: { duration: 15, isCaller: 0 } };
    expect(parseCallDetails(content)).toEqual({
      direction: 'inbound', callType: 'voice', isMissed: false, durationSec: 15,
    });
  });
});

describe('parseCallDetails — shape phẳng fallback (callDuration/callType/isCaller/isMissed)', () => {
  it('callType chứa "video" → video', () => {
    const content = { callType: 'video_call', callDuration: 42, isCaller: 1 };
    expect(parseCallDetails(content)).toEqual({
      direction: 'outbound', callType: 'video', isMissed: false, durationSec: 42,
    });
  });

  it('isMissed=true (boolean rõ ràng) → ưu tiên field này', () => {
    const content = { isMissed: true, callType: 'voice', callDuration: 999, isCaller: 0 };
    expect(parseCallDetails(content)?.isMissed).toBe(true);
  });

  it('callType chứa "miss" → missed', () => {
    const content = { callType: 'miss_call', duration: 5, isCaller: 0 };
    expect(parseCallDetails(content)?.isMissed).toBe(true);
  });

  it('thiếu isCaller → mặc định inbound', () => {
    const content = { callDuration: 10 };
    expect(parseCallDetails(content)?.direction).toBe('inbound');
  });
});

describe('parseCallDetails — không phải call message', () => {
  it('content không phải object → null', () => {
    expect(parseCallDetails('hello')).toBeNull();
    expect(parseCallDetails(null)).toBeNull();
    expect(parseCallDetails(undefined)).toBeNull();
  });

  it('object không có action/callDuration/callType → null', () => {
    expect(parseCallDetails({ text: 'hi' })).toBeNull();
  });

  it('action không liên quan call → null', () => {
    expect(parseCallDetails({ action: 'zinstant.bankcard' })).toBeNull();
  });
});
