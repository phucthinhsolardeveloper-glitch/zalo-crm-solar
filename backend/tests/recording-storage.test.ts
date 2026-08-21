// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  decryptRecordingBuffer,
  encryptRecordingBuffer,
  isPrivateRecordingReference,
  privateRecordingKey,
} from '../src/modules/telephony/recording-storage.js';

describe('encrypted recording storage', () => {
  it('round-trips arbitrary audio bytes without exposing plaintext', () => {
    const plain = Buffer.from([0x49, 0x44, 0x33, 0x00, 0xff, 0x10, 0x20]);
    const encrypted = encryptRecordingBuffer(plain);
    expect(encrypted.equals(plain)).toBe(false);
    expect(encrypted.includes(plain)).toBe(false);
    expect(decryptRecordingBuffer(encrypted)).toEqual(plain);
  });

  it('encrypts identical recordings deterministically for storage deduplication', () => {
    const plain = Buffer.from('same recording bytes');
    expect(encryptRecordingBuffer(plain)).toEqual(encryptRecordingBuffer(plain));
    expect(encryptRecordingBuffer(Buffer.from('different recording bytes')))
      .not.toEqual(encryptRecordingBuffer(plain));
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptRecordingBuffer(Buffer.from('audio payload'));
    encrypted[encrypted.length - 1] ^= 0xff;
    expect(() => decryptRecordingBuffer(encrypted)).toThrow();
  });

  it('accepts only the internal versioned recording reference format', () => {
    const key = `recordings/${'a'.repeat(64)}.enc`;
    expect(isPrivateRecordingReference(`crm-recording:v1:${key}`)).toBe(true);
    expect(privateRecordingKey(`crm-recording:v1:${key}`)).toBe(key);
    expect(privateRecordingKey('crm-recording:v1:../media/file.mp3')).toBeNull();
    expect(privateRecordingKey('https://example.com/recording.mp3')).toBeNull();
  });
});
