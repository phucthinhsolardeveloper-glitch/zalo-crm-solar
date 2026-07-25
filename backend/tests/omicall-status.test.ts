// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { mapOmicallEventStatus } from '../src/modules/telephony/omicall-status.js';

describe('mapOmicallEventStatus', () => {
  it('maps create/early to initiated', () => {
    expect(mapOmicallEventStatus({ state: 'create' })).toBe('initiated');
    expect(mapOmicallEventStatus({ state: 'early' })).toBe('initiated');
  });
  it('maps ringing to ringing', () => {
    expect(mapOmicallEventStatus({ state: 'ringing' })).toBe('ringing');
  });
  it('maps answered to answered', () => {
    expect(mapOmicallEventStatus({ state: 'answered' })).toBe('answered');
  });
  it('maps hangup with bill_sec > 0 to completed', () => {
    expect(mapOmicallEventStatus({ state: 'hangup', bill_sec: 42 })).toBe('completed');
  });
  it('maps hangup with 0 bill_sec and answer_sec > 0 to rejected (agent declined after ring)', () => {
    expect(mapOmicallEventStatus({ state: 'hangup', bill_sec: 0, answer_sec: 0 })).toBe('missed');
  });
  it('returns null for unrecognized state', () => {
    expect(mapOmicallEventStatus({ state: 'weird_unknown' })).toBeNull();
    expect(mapOmicallEventStatus({})).toBeNull();
  });
});
