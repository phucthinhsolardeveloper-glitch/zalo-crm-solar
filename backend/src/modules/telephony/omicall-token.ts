// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * omicall-token.ts — encrypt/decrypt the per-agent Omicall extension password
 * (sipPassword) at rest. Unlike Stringee's server-signed JWT, Omicall Web SDK
 * registration needs the extension's real, durable SIP credential — there is
 * no scoped/expiring token to mint, so the secret itself must be stored.
 */
import { config } from '../../config/index.js';
import { decrypt, encrypt } from '../../shared/crypto/aes-gcm.js';

export function encryptOmicallSecret(plainPassword: string): string {
  return encrypt(plainPassword, config.encryptionKey);
}

export function decryptOmicallSecret(ciphertext: string): string {
  return decrypt(ciphertext, config.encryptionKey);
}
