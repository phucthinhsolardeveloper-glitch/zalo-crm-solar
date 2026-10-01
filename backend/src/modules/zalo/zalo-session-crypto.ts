// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Zalo session credentials encryption at rest.
 *
 * The database keeps an envelope instead of raw cookie/IMEI/user-agent.
 * Legacy plaintext rows remain readable for a controlled migration window;
 * every new login/import is encrypted before persistence.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FORMAT = 'zalo-session-encrypted-v1';

export interface ZaloSessionCredentials {
  // zca-js currently serializes cookies as an array; older exports may use an object.
  cookie: unknown;
  imei: string;
  userAgent: string;
}

export interface ZaloSessionEnvelope {
  __format: typeof FORMAT;
  /** Short non-secret fingerprint of the key used for this envelope. */
  keyId?: string;
  iv: string;
  tag: string;
  data: string;
}

function material(configured: string): Buffer {
  // Production config is expected to be a 64-char hex key. Hashing also keeps
  // development/test fallback values deterministic without storing raw secrets.
  if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  return createHash('sha256').update(configured, 'utf8').digest();
}

function currentKey(): Buffer {
  return material(config.zaloSessionEncryptionKey);
}

function previousKey(): Buffer | null {
  return config.zaloSessionEncryptionKeyPrevious ? material(config.zaloSessionEncryptionKeyPrevious) : null;
}

function keyId(keyMaterial: Buffer): string {
  // This identifies the key without disclosing any key material.
  return createHash('sha256').update(keyMaterial).digest('hex').slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isEncryptedZaloSession(value: unknown): value is ZaloSessionEnvelope {
  if (!isRecord(value)) return false;
  return value.__format === FORMAT
    && (value.keyId === undefined || typeof value.keyId === 'string')
    && typeof value.iv === 'string'
    && typeof value.tag === 'string'
    && typeof value.data === 'string';
}

function isCredentials(value: unknown): value is ZaloSessionCredentials {
  if (!isRecord(value)) return false;
  return typeof value.imei === 'string'
    && value.imei.length > 0
    && typeof value.userAgent === 'string'
    && value.userAgent.length > 0
    && (Array.isArray(value.cookie) || isRecord(value.cookie));
}

export function encryptZaloSession(credentials: ZaloSessionCredentials): ZaloSessionEnvelope {
  if (!isCredentials(credentials)) throw new Error('Invalid Zalo session credentials');
  const iv = randomBytes(IV_BYTES);
  const activeKey = currentKey();
  const cipher = createCipheriv(ALGORITHM, activeKey, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ]);
  return {
    __format: FORMAT,
    keyId: keyId(activeKey),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}

export function decryptZaloSession(value: unknown): ZaloSessionCredentials | null {
  if (isCredentials(value)) return value;
  if (!isEncryptedZaloSession(value)) return null;

  const iv = Buffer.from(value.iv, 'base64');
  const tag = Buffer.from(value.tag, 'base64');
  const data = Buffer.from(value.data, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || data.length === 0) {
    throw new Error('Invalid encrypted Zalo session envelope');
  }

  const active = currentKey();
  const previous = previousKey();
  const candidates = value.keyId
    ? [
      ...(value.keyId === keyId(active) ? [active] : []),
      ...(previous && value.keyId === keyId(previous) ? [previous] : []),
    ]
    : [active, ...(previous ? [previous] : [])];
  if (candidates.length === 0) throw new Error('Unknown encryption key for Zalo session');

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const decipher = createDecipheriv(ALGORITHM, candidate, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
      const parsed: unknown = JSON.parse(plain);
      return isCredentials(parsed) ? parsed : null;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to decrypt Zalo session');
}

/** True when a ciphertext can be safely rewritten using the active key. */
export function isZaloSessionUsingCurrentKey(value: unknown): boolean {
  return isEncryptedZaloSession(value) && value.keyId === keyId(currentKey());
}

/** Decrypt with the rollover window, then encrypt under the active key. */
export function reencryptZaloSession(value: unknown): ZaloSessionEnvelope {
  const credentials = decryptZaloSession(value);
  if (!credentials) throw new Error('Invalid Zalo session credentials');
  return encryptZaloSession(credentials);
}

/** Returns true when a valid legacy raw row should be rewritten encrypted. */
export function isLegacyZaloSession(value: unknown): value is ZaloSessionCredentials {
  return isCredentials(value);
}
