// SPDX-License-Identifier: AGPL-3.0-or-later
import { assertSafeOutboundUrl } from '../../shared/utils/ssrf-guard.js';
import { logger } from '../../shared/utils/logger.js';
import { storePrivateRecording } from './recording-storage.js';

type OmicallRecordingPayload = Record<string, unknown>;

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function recordingCandidates(payload: OmicallRecordingPayload): string[] {
  // API v3's current response example shows recording_file as the concrete
  // .mp3 URL and recording_file_url as a separate link. Webhook CDRs commonly
  // contain only recording_file_url, so preserve it as the fallback.
  return [payload.recording_file, payload.recording_file_url]
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .filter((value) => {
      try {
        assertSafeOutboundUrl(value);
        return true;
      } catch {
        return false;
      }
    });
}

export function omicallRecordingUrl(payload: OmicallRecordingPayload): string | null {
  return recordingCandidates(payload)[0] || null;
}

function normalizedAudioMimeType(url: URL, responseMimeType: string): string | null {
  if (responseMimeType.startsWith('audio/')) return responseMimeType;
  const genericTypes = new Set([
    '',
    'application/octet-stream',
    'application/download',
    'application/force-download',
    'binary/octet-stream',
  ]);
  if (!genericTypes.has(responseMimeType)) return null;

  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith('.wav')) return 'audio/wav';
  if (pathname.endsWith('.m4a')) return 'audio/mp4';
  if (pathname.endsWith('.ogg')) return 'audio/ogg';
  if (pathname.endsWith('.webm')) return 'audio/webm';
  return 'audio/mpeg';
}

async function fetchRecording(rawUrl: string): Promise<{ response: Response; finalUrl: URL }> {
  let current = assertSafeOutboundUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: current };
    }
    const location = response.headers.get('location');
    if (!location || redirect === MAX_REDIRECTS) throw new Error('too many or invalid redirects');
    current = assertSafeOutboundUrl(new URL(location, current).toString());
  }
  throw new Error('too many redirects');
}

async function readRecordingBody(response: Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RECORDING_BYTES) {
    throw new Error('recording exceeds 100 MiB');
  }
  if (!response.body) throw new Error('empty recording response');

  const chunks: Buffer[] = [];
  let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RECORDING_BYTES) {
      await reader.cancel();
      throw new Error('recording exceeds 100 MiB');
    }
    chunks.push(Buffer.from(value));
  }
  if (size === 0) throw new Error('empty recording response');
  return Buffer.concat(chunks, size);
}

/**
 * Download an Omicall recording while its provider URL is valid and mirror it
 * into the CRM's configured local/R2 storage. If every download attempt fails,
 * retain the best documented provider URL so a later history sync can retry.
 */
export async function persistOmicallRecording(payload: OmicallRecordingPayload): Promise<string | null> {
  const candidates = recordingCandidates(payload);
  for (const sourceUrl of candidates) {
    try {
      const { response, finalUrl } = await fetchRecording(sourceUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const responseMimeType = (response.headers.get('content-type') || '')
        .split(';')[0]
        .trim()
        .toLowerCase();
      const mimeType = normalizedAudioMimeType(finalUrl, responseMimeType);
      if (!mimeType) throw new Error(`unexpected content-type ${responseMimeType || 'unknown'}`);
      const buffer = await readRecordingBody(response);
      // Store ciphertext under a non-public namespace and persist only an
      // internal reference. The authenticated playback route decrypts it.
      return await storePrivateRecording(buffer);
    } catch (error) {
      logger.warn({ sourceUrl, error: (error as Error).message }, '[omicall-recording] mirror failed');
    }
  }
  return candidates[0] || null;
}
