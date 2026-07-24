// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { ref, type Ref } from 'vue';
import { api } from '@/api/index';

export interface CallRecordDTO {
  id: string;
  contactId: string;
  friendId: string | null;
  zaloAccountId: string;
  conversationId: string | null;
  sourceMessageId: string | null;
  direction: 'inbound' | 'outbound';
  callType: 'voice' | 'video';
  status: 'manual' | 'connected' | 'missed';
  durationSec: number | null;
  occurredAt: string;
  recordingUrl: string | null;
  recordingMimeType: string | null;
  note: string | null;
  createdAt: string;
}

export interface LogManualCallInput {
  contactId: string;
  friendId?: string | null;
  zaloAccountId: string;
  conversationId?: string | null;
  callType: 'voice' | 'video';
  direction: 'inbound' | 'outbound';
  durationSec?: number | null;
  occurredAt?: string;
  note?: string | null;
}

export function useCalls(): {
  calls: Ref<CallRecordDTO[]>;
  loading: Ref<boolean>;
  fetchCalls: (contactId: string) => Promise<void>;
  logManualCall: (input: LogManualCallInput) => Promise<CallRecordDTO>;
  uploadRecording: (callId: string, file: File) => Promise<CallRecordDTO>;
  removeRecording: (callId: string) => Promise<CallRecordDTO>;
} {
  const calls = ref<CallRecordDTO[]>([]);
  const loading = ref(false);

  async function fetchCalls(contactId: string): Promise<void> {
    loading.value = true;
    try {
      const { data } = await api.get(`/contacts/${contactId}/calls`);
      calls.value = data.calls;
    } finally {
      loading.value = false;
    }
  }

  async function logManualCall(input: LogManualCallInput): Promise<CallRecordDTO> {
    const { data } = await api.post('/calls', input);
    return data.call;
  }

  async function uploadRecording(callId: string, file: File): Promise<CallRecordDTO> {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post(`/calls/${callId}/recording`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.call;
  }

  async function removeRecording(callId: string): Promise<CallRecordDTO> {
    const { data } = await api.delete(`/calls/${callId}/recording`);
    return data.call;
  }

  return { calls, loading, fetchCalls, logManualCall, uploadRecording, removeRecording };
}
