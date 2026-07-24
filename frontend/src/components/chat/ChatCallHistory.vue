<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="chat-call-history">
    <v-divider class="my-3" />
    <div class="d-flex align-center mb-2">
      <v-icon size="16" color="primary" class="mr-1">mdi-phone-clock</v-icon>
      <span class="text-caption font-weight-bold">Lịch sử cuộc gọi ({{ calls.length }})</span>
    </div>

    <div v-if="loading" class="text-caption text-medium-emphasis">Đang tải…</div>
    <div v-else-if="!calls.length" class="text-caption text-medium-emphasis">
      Chưa có cuộc gọi nào.
    </div>

    <div v-for="call in calls" :key="call.id" class="call-history-row">
      <v-icon :size="18" :color="call.status === 'missed' ? 'error' : 'success'">
        {{ callIcon(call) }}
      </v-icon>
      <div class="chr-meta">
        <div class="chr-title">{{ callLabel(call) }}</div>
        <div class="chr-sub">
          {{ formatDate(call.occurredAt) }}
          <span v-if="call.durationSec">· {{ formatDuration(call.durationSec) }}</span>
        </div>
      </div>
      <audio v-if="call.recordingUrl" class="chr-audio" controls :src="call.recordingUrl" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useCalls, type CallRecordDTO } from '@/composables/use-calls';

const props = defineProps<{ contactId: string | null }>();
// has-calls: cho ChatContactPanel biết tab có dữ liệu để tính hasAnyActivity
// (component này tự fetch, không prop-drill danh sách lên cha).
const emit = defineEmits<{ (e: 'has-calls', value: boolean): void }>();

const { calls, loading, fetchCalls } = useCalls();

async function load() {
  if (props.contactId) await fetchCalls(props.contactId);
  emit('has-calls', calls.value.length > 0);
}

onMounted(load);
watch(() => props.contactId, load);

function callLabel(call: CallRecordDTO): string {
  const dir = call.direction === 'outbound' ? 'đi' : 'đến';
  const type = call.callType === 'video' ? 'video' : 'thoại';
  if (call.status === 'missed') return `Cuộc gọi ${type} nhỡ`;
  return `Cuộc gọi ${type} ${dir}`;
}

function callIcon(call: CallRecordDTO): string {
  if (call.status === 'missed') return 'mdi-phone-missed';
  if (call.callType === 'video') return 'mdi-video';
  return call.direction === 'outbound' ? 'mdi-phone-outgoing' : 'mdi-phone-incoming';
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} giây`;
  if (s === 0) return `${m} phút`;
  return `${m} phút ${s} giây`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
</script>

<style scoped>
.call-history-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--smax-grey-100, #eee);
}
.chr-meta { flex: 1; min-width: 0; }
.chr-title { font-size: 13px; font-weight: 600; }
.chr-sub { font-size: 11px; color: var(--smax-grey-500, #888); }
.chr-audio { max-width: 160px; height: 28px; }
</style>
