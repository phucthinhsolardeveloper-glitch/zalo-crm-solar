<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  CallNotesPanel.vue — timeline ghi chú theo đầu số. Mỗi note vẫn giữ callId nguồn
  để biết được nhập sau lần gọi nào; internal call không có đầu số dùng timeline riêng.
-->
<template>
  <div class="call-notes-panel">
    <div v-if="loading" class="cnp-state"><v-progress-circular indeterminate size="20" width="2" /> Đang tải…</div>
    <template v-else>
      <div class="cnp-title">{{ scope === 'phone' ? 'Lịch sử ghi chú của số này' : 'Ghi chú cuộc gọi nội bộ' }}</div>
      <div class="cnp-list">
        <div v-if="!notes.length" class="cnp-empty">Chưa có ghi chú trong lịch sử này.</div>
        <div v-for="note in notes" :key="note.id" class="cnp-item">
          <div class="cnp-item-head">
            <strong>{{ note.author?.fullName || 'Không rõ' }}</strong>
            <time>{{ formatTime(note.createdAt) }}</time>
          </div>
          <small v-if="scope === 'phone' && note.call?.startedAt" class="cnp-source">
            Sau cuộc gọi {{ formatTime(note.call.startedAt) }}
          </small>
          <p>{{ note.body }}</p>
        </div>
      </div>
      <div class="cnp-add">
        <textarea
          v-model="draft"
          rows="2"
          :placeholder="scope === 'phone' ? 'Thêm ghi chú cho số điện thoại này…' : 'Ghi chú cho cuộc gọi nội bộ…'"
          :disabled="saving"
          @keydown.enter.exact.prevent="save"
        />
        <button class="cnp-save" :disabled="!draft.trim() || saving" @click="save">
          {{ saving ? 'Đang lưu…' : 'Lưu ghi chú' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';

const props = defineProps<{ callId: string }>();
const emit = defineEmits<{ (e: 'saved', note: CallNote): void }>();

interface CallNote {
  id: string;
  body: string;
  createdAt: string;
  // author FK là required (authorUserId not-null) — Prisma include luôn trả về row, không null.
  author: { id: string; fullName: string; avatarUrl?: string | null };
  call?: { id: string; startedAt: string; direction: string };
}

const notes = ref<CallNote[]>([]);
const loading = ref(false);
const saving = ref(false);
const draft = ref('');
const scope = ref<'phone' | 'call'>('call');
const toast = useToast();

async function load() {
  if (!props.callId) return;
  loading.value = true;
  try {
    const { data } = await api.get(`/telephony/calls/${props.callId}/notes`);
    notes.value = data.notes || [];
    scope.value = data.scope === 'phone' ? 'phone' : 'call';
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không tải được ghi chú cuộc gọi');
  } finally {
    loading.value = false;
  }
}

async function save() {
  const body = draft.value.trim();
  if (!body || saving.value) return;
  saving.value = true;
  try {
    const { data } = await api.post(`/telephony/calls/${props.callId}/notes`, { body });
    notes.value = [data, ...notes.value];
    draft.value = '';
    emit('saved', data);
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không lưu được ghi chú');
  } finally {
    saving.value = false;
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(value));
}

watch(() => props.callId, load);
onMounted(load);
</script>

<style scoped>
.call-notes-panel { display: flex; flex-direction: column; gap: 10px; min-width: 280px; max-width: 380px; }
.cnp-title { color: #34454b; font-size: 12px; font-weight: 800; }
.cnp-state { display: flex; align-items: center; gap: 8px; padding: 10px; color: #6b787e; font-size: 13px; }
.cnp-list { display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; }
.cnp-empty { padding: 8px 0; color: #8b979c; font-size: 12px; }
.cnp-item { padding: 8px 10px; border-radius: 8px; background: #f5f7f7; }
.cnp-item-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 3px; }
.cnp-item-head strong { font-size: 12px; color: #253238; }
.cnp-item-head time { font-size: 11px; color: #8b979c; white-space: nowrap; }
.cnp-source { display: block; margin-bottom: 4px; color: #879399; font-size: 10.5px; }
.cnp-item p { margin: 0; font-size: 13px; color: #3b474c; white-space: pre-wrap; word-break: break-word; }
.cnp-add { display: flex; flex-direction: column; gap: 6px; }
.cnp-add textarea { resize: vertical; border: 1px solid #d9e1e1; border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; outline: none; }
.cnp-save { align-self: flex-end; border: 0; border-radius: 8px; padding: 7px 14px; background: #147d70; color: #fff; font-weight: 700; font-size: 12px; cursor: pointer; }
.cnp-save:disabled { opacity: .5; cursor: not-allowed; }
</style>
