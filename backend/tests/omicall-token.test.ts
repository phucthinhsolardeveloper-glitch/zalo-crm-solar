// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { decryptOmicallSecret, encryptOmicallSecret } from '../src/modules/telephony/omicall-token.js';

describe('omicall-token', () => {
  it('round-trips a sip password through encrypt/decrypt', () => {
    const plain = 'S3cretExtP@ss!';
    const ciphertext = encryptOmicallSecret(plain);
    expect(ciphertext).not.toBe(plain);
    expect(ciphertext.split(':')).toHaveLength(3);
    expect(decryptOmicallSecret(ciphertext)).toBe(plain);
  });

  it('produces different ciphertext for the same plaintext each call (random IV)', () => {
    const a = encryptOmicallSecret('same-password');
    const b = encryptOmicallSecret('same-password');
    expect(a).not.toBe(b);
  });
});
