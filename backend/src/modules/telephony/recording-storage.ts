// SPDX-License-Identifier: AGPL-3.0-or-later
import { createCipheriv, createDecipheriv, createHash, createHmac } from 'node:crypto';
import { config } from '../../config/index.js';
import { getObjectBuffer, uploadRecordingBuffer } from '../../shared/storage/minio-client.js';

const REFERENCE_PREFIX = 'crm-recording:v1:';
const FILE_MAGIC = Buffer.from('ZCRMREC1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD = Buffer.from('zalo-crm/telephony-recording/v1', 'utf8');

function recordingEncryptionKey(): Buffer {
  // Domain-separated derivation prevents the recording key from being reused
  // directly by token/password encryption while keeping existing deployments
  // compatible with their mandatory ENCRYPTION_KEY.
  return createHash('sha256')
    .update('zalo-crm/telephony-recording/v1\0', 'utf8')
    .update(config.encryptionKey, 'utf8')
    .digest();
}

export function isPrivateRecordingReference(value: string): boolean {
  return value.startsWith(REFERENCE_PREFIX);
}

export function privateRecordingKey(value: string): string | null {
  if (!isPrivateRecordingReference(value)) return null;
  const key = value.slice(REFERENCE_PREFIX.length);
  return /^recordings\/[a-f0-9]{64}\.enc$/.test(key) ? key : null;
}

export function encryptRecordingBuffer(plain: Buffer): Buffer {
  const key = recordingEncryptionKey();
  // A plaintext-derived, keyed nonce keeps encryption deterministic solely for
  // identical recordings, so the storage content-hash can deduplicate repeated
  // OmiCall history syncs. Different plaintexts have independent nonces; the
  // HMAC also prevents an observer from predicting the nonce from known audio.
  const iv = createHmac('sha256', key).update('recording-nonce-v1\0').update(plain).digest().subarray(0, IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptRecordingBuffer(payload: Buffer): Buffer {
  const headerBytes = FILE_MAGIC.length + IV_BYTES + TAG_BYTES;
  if (payload.length <= headerBytes || !payload.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)) {
    throw new Error('invalid encrypted recording format');
  }
  const ivStart = FILE_MAGIC.length;
  const tagStart = ivStart + IV_BYTES;
  const dataStart = tagStart + TAG_BYTES;
  const decipher = createDecipheriv('aes-256-gcm', recordingEncryptionKey(), payload.subarray(ivStart, tagStart));
  decipher.setAAD(AAD);
  decipher.setAuthTag(payload.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(payload.subarray(dataStart)), decipher.final()]);
}

export async function storePrivateRecording(plain: Buffer): Promise<string> {
  const uploaded = await uploadRecordingBuffer(encryptRecordingBuffer(plain));
  return `${REFERENCE_PREFIX}${uploaded.key}`;
}

export async function readPrivateRecording(reference: string): Promise<Buffer | null> {
  const key = privateRecordingKey(reference);
  if (!key) return null;
  const encrypted = await getObjectBuffer(key);
  if (!encrypted) return null;
  return decryptRecordingBuffer(encrypted);
}
