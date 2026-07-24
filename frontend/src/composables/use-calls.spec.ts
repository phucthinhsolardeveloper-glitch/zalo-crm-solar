// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiMock = { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
vi.mock('@/api/index', () => ({ api: apiMock }));

const { useCalls } = await import('./use-calls');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCalls', () => {
  it('fetchCalls gọi GET đúng endpoint và set calls', async () => {
    apiMock.get.mockResolvedValue({ data: { calls: [{ id: 'cr1' }] } });
    const { calls, loading, fetchCalls } = useCalls();
    const p = fetchCalls('c1');
    expect(loading.value).toBe(true);
    await p;
    expect(apiMock.get).toHaveBeenCalledWith('/contacts/c1/calls');
    expect(calls.value).toEqual([{ id: 'cr1' }]);
    expect(loading.value).toBe(false);
  });

  it('logManualCall gọi POST /calls với đúng body', async () => {
    apiMock.post.mockResolvedValue({ data: { call: { id: 'cr2' } } });
    const { logManualCall } = useCalls();
    const result = await logManualCall({
      contactId: 'c1', zaloAccountId: 'z1', callType: 'voice', direction: 'outbound',
    });
    expect(apiMock.post).toHaveBeenCalledWith('/calls', {
      contactId: 'c1', zaloAccountId: 'z1', callType: 'voice', direction: 'outbound',
    });
    expect(result).toEqual({ id: 'cr2' });
  });

  it('uploadRecording gửi multipart FormData tới đúng endpoint', async () => {
    apiMock.post.mockResolvedValue({ data: { call: { id: 'cr1', recordingUrl: 'https://x/a.mp3' } } });
    const { uploadRecording } = useCalls();
    const file = new File(['audio-bytes'], 'ghiam.mp3', { type: 'audio/mpeg' });
    const result = await uploadRecording('cr1', file);
    expect(apiMock.post).toHaveBeenCalledWith(
      '/calls/cr1/recording',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    );
    expect(result).toEqual({ id: 'cr1', recordingUrl: 'https://x/a.mp3' });
  });

  it('removeRecording gọi DELETE đúng endpoint', async () => {
    apiMock.delete.mockResolvedValue({ data: { call: { id: 'cr1', recordingUrl: null } } });
    const { removeRecording } = useCalls();
    const result = await removeRecording('cr1');
    expect(apiMock.delete).toHaveBeenCalledWith('/calls/cr1/recording');
    expect(result).toEqual({ id: 'cr1', recordingUrl: null });
  });
});
