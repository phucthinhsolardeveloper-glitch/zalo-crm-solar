// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/telephony/recording-storage.js', () => ({
  storePrivateRecording: vi.fn(),
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { storePrivateRecording } from '../src/modules/telephony/recording-storage.js';
import {
  omicallRecordingUrl,
  persistOmicallRecording,
} from '../src/modules/telephony/omicall-recording.js';

describe('Omicall recording handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('prefers v3 recording_file over recording_file_url', () => {
    expect(omicallRecordingUrl({
      recording_file: 'https://public-v1.omicrm.com/call.mp3',
      recording_file_url: 'https://public-v1.omicrm.com/call',
    })).toBe('https://public-v1.omicrm.com/call.mp3');
  });

  it('uses the webhook recording_file_url when it is the only recording field', () => {
    expect(omicallRecordingUrl({
      recording_file_url: 'https://public-v1.omicrm.com/webhook-call.mp3',
    })).toBe('https://public-v1.omicrm.com/webhook-call.mp3');
  });

  it('downloads audio and stores an internal encrypted reference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      new Uint8Array([0x49, 0x44, 0x33, 0x04]),
      { status: 200, headers: { 'content-type': 'audio/mpeg' } },
    )));
    (storePrivateRecording as any).mockResolvedValue(
      `crm-recording:v1:recordings/${'a'.repeat(64)}.enc`,
    );

    await expect(persistOmicallRecording({
      recording_file: 'https://public-v1.omicrm.com/call.mp3',
    })).resolves.toBe(`crm-recording:v1:recordings/${'a'.repeat(64)}.enc`);

    expect(storePrivateRecording).toHaveBeenCalledWith(Buffer.from([0x49, 0x44, 0x33, 0x04]));
  });

  it('rejects a non-audio response and keeps the provider URL for retry/playback fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      '<html>not an audio file</html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    )));

    const source = 'https://public-v1.omicrm.com/call';
    await expect(persistOmicallRecording({ recording_file_url: source })).resolves.toBe(source);
    expect(storePrivateRecording).not.toHaveBeenCalled();
  });

  it('does not fetch unsafe recording URLs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(persistOmicallRecording({
      recording_file: 'http://127.0.0.1/private.mp3',
    })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
