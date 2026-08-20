<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <main class="call-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">TỔNG ĐÀI · ZALO OA</p>
        <h1>Lịch sử cuộc gọi</h1>
        <p class="subtitle">Tra cứu cuộc gọi, thời lượng và nghe lại file ghi âm từ tổng đài.</p>
      </div>
      <button class="sync-btn" :disabled="syncing" @click="syncOmicall">
        <v-icon :icon="syncing ? 'mdi-loading' : 'mdi-cloud-sync-outline'" :class="{ spin: syncing }" size="18" />
        {{ syncing ? 'Đang đồng bộ…' : canViewOrganization ? 'Đồng bộ tài khoản tôi' : 'Đồng bộ tổng đài' }}
      </button>
    </header>

    <section class="summary-grid" aria-label="Tổng quan lịch sử cuộc gọi">
      <article class="summary-card">
        <span class="summary-icon teal"><v-icon icon="mdi-phone-outline" /></span>
        <div><strong>{{ number(summary.total) }}</strong><span>Tổng cuộc gọi</span></div>
      </article>
      <article class="summary-card">
        <span class="summary-icon blue"><v-icon icon="mdi-clock-outline" /></span>
        <div><strong>{{ duration(summary.totalDurationSec) }}</strong><span>Tổng thời lượng</span></div>
      </article>
      <article class="summary-card">
        <span class="summary-icon red"><v-icon icon="mdi-phone-missed-outline" /></span>
        <div><strong>{{ number(summary.missed) }}</strong><span>Không kết nối</span></div>
      </article>
      <article class="summary-card">
        <span class="summary-icon amber"><v-icon icon="mdi-record-rec" /></span>
        <div><strong>{{ number(summary.recordings) }}</strong><span>Có ghi âm</span></div>
      </article>
    </section>

    <section class="history-panel">
      <div class="filters">
        <label class="search-field">
          <v-icon icon="mdi-magnify" size="19" />
          <input v-model="filters.search" placeholder="Tìm tên khách hàng, nhân viên hoặc số điện thoại" @keyup.enter="applyFilters" />
        </label>

        <select v-if="canViewOrganization" v-model="filters.scope" @change="scopeChanged">
          <option value="organization">Toàn công ty</option>
          <option value="mine">Cuộc gọi của tôi</option>
        </select>
        <select
          v-if="canViewOrganization && filters.scope === 'organization'"
          v-model="filters.ownerUserId"
          @change="applyFilters"
        >
          <option value="">Tất cả nhân viên</option>
          <option v-for="user in users" :key="user.id" :value="user.id">{{ user.fullName }}</option>
        </select>
        <select v-model="filters.direction" @change="applyFilters">
          <option value="">Tất cả hướng gọi</option>
          <option value="outbound">Cuộc gọi đi</option>
          <option value="inbound">Cuộc gọi đến</option>
        </select>
        <select v-model="filters.status" @change="applyFilters">
          <option value="">Tất cả trạng thái</option>
          <option value="completed">Hoàn thành</option>
          <option value="answered">Đã trả lời</option>
          <option value="missed">Gọi nhỡ</option>
          <option value="rejected">Từ chối</option>
          <option value="failed">Thất bại</option>
        </select>
        <select v-model="filters.channel" @change="applyFilters">
          <option value="">Tất cả kênh</option>
          <option value="zcc">Zalo OA</option>
          <option value="pstn">Điện thoại</option>
          <option value="internal">Nội bộ</option>
        </select>
        <label class="date-field"><span>Từ ngày</span><input v-model="filters.from" type="date" @change="applyFilters" /></label>
        <label class="date-field"><span>Đến ngày</span><input v-model="filters.to" type="date" @change="applyFilters" /></label>
        <label class="recording-filter">
          <input v-model="filters.recording" type="checkbox" @change="applyFilters" />
          Chỉ có ghi âm
        </label>
        <button class="apply-btn" @click="applyFilters">Lọc</button>
        <button class="reset-btn" title="Xóa bộ lọc" @click="resetFilters"><v-icon icon="mdi-filter-off-outline" size="18" /></button>
      </div>

      <div v-if="errorMessage" class="error-banner">
        <v-icon icon="mdi-alert-circle-outline" />
        <span>{{ errorMessage }}</span>
        <button @click="loadCalls()">Thử lại</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Khách hàng / Số điện thoại</th>
              <th v-if="canViewOrganization && filters.scope === 'organization'">Nhân viên</th>
              <th>Hướng gọi</th>
              <th>Kênh</th>
              <th>Thời gian</th>
              <th>Thời lượng</th>
              <th>Trạng thái</th>
              <th>Ghi âm</th>
              <th>Ghi chú</th>
              <th>Hành động</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="columnCount" class="state-cell">
                <v-progress-circular indeterminate size="26" width="2" /> Đang tải lịch sử…
              </td>
            </tr>
            <tr v-else-if="!calls.length">
              <td :colspan="columnCount" class="empty-cell">
                <v-icon icon="mdi-phone-off-outline" size="38" />
                <strong>Chưa có cuộc gọi phù hợp</strong>
                <span>Thử thay đổi bộ lọc hoặc đồng bộ lịch sử từ tổng đài.</span>
              </td>
            </tr>
            <template v-for="call in calls" :key="call.id">
              <tr>
                <td>
                  <div class="customer-cell">
                    <span class="avatar">{{ initials(callName(call)) }}</span>
                    <div>
                      <strong>{{ callName(call) }}</strong>
                      <span>{{ displayPhone(call.externalNumber) || (call.channel === 'internal' ? 'Cuộc gọi nội bộ' : '') }}</span>
                    </div>
                  </div>
                </td>
                <td v-if="canViewOrganization && filters.scope === 'organization'">
                  <span class="agent-name">{{ call.ownerUser?.fullName || '—' }}</span>
                </td>
                <td>
                  <span class="direction">
                    <v-icon :icon="call.direction === 'inbound' ? 'mdi-phone-incoming-outline' : 'mdi-phone-outgoing-outline'" size="17" />
                    {{ call.direction === 'inbound' ? 'Gọi đến' : 'Gọi đi' }}
                  </span>
                </td>
                <td><span class="channel" :class="call.channel">{{ channelLabel(call.channel) }}</span></td>
                <td><time>{{ dateTime(call.startedAt) }}</time></td>
                <td>{{ duration(call.durationSec || 0, true) }}</td>
                <td><span class="status" :class="call.status">{{ statusLabel(call.status) }}</span></td>
                <td>
                  <button
                    v-if="recordingUrl(call)"
                    class="play-btn"
                    :class="{ active: playingId === call.id }"
                    @click="toggleRecording(call.id)"
                  >
                    <v-icon :icon="playingId === call.id ? 'mdi-stop' : 'mdi-play'" size="16" />
                    {{ playingId === call.id ? 'Đóng' : 'Nghe' }}
                  </button>
                  <span v-else class="no-recording">Chưa có</span>
                </td>
                <td>
                  <v-menu :close-on-content-click="false" location="bottom end">
                    <template #activator="{ props: menuProps }">
                      <button
                        class="note-btn"
                        v-bind="menuProps"
                        :title="call.latestNote?.body || 'Xem/thêm ghi chú cuộc gọi'"
                      >
                        <v-icon icon="mdi-note-text-outline" size="16" />
                        {{ call.latestNote ? 'Đã có' : 'Thêm' }}
                      </button>
                    </template>
                    <v-card class="note-menu-card">
                      <CallNotesPanel :call-id="call.id" @saved="(n) => onNoteSaved(call, n)" />
                    </v-card>
                  </v-menu>
                </td>
                <td>
                  <div class="row-actions">
                    <CallButton
                      v-if="call.channel === 'internal'"
                      :peer="callTargetPeer(call)"
                      size="small"
                    />
                    <CallButton
                      v-else
                      :phone="call.externalNumber"
                      :contact-id="call.contact?.id"
                      :full-name="callName(call)"
                      size="small"
                    />
                    <button
                      v-if="!call.contact && call.channel !== 'internal'"
                      class="link-btn"
                      title="Tạo khách hàng từ số này"
                      @click="openCreateCustomer(call)"
                    >
                      <v-icon icon="mdi-account-plus-outline" size="16" />
                    </button>
                    <v-menu v-if="!call.contact && call.channel !== 'internal'" :close-on-content-click="false" location="bottom end">
                      <template #activator="{ props: menuProps }">
                        <button class="link-btn" title="Gắn vào khách hàng có sẵn" v-bind="menuProps">
                          <v-icon icon="mdi-account-search-outline" size="16" />
                        </button>
                      </template>
                      <v-card class="link-menu-card">
                        <input
                          v-model="linkSearch"
                          class="link-search-input"
                          placeholder="Tìm tên hoặc SĐT khách hàng…"
                          @input="onLinkSearchInput"
                        />
                        <div v-if="linkSearchLoading" class="link-search-state">Đang tìm…</div>
                        <div v-else-if="linkSearch.trim().length >= 2 && !linkSearchResults.length" class="link-search-state">
                          Không tìm thấy khách hàng phù hợp.
                        </div>
                        <button
                          v-for="r in linkSearchResults"
                          :key="r.contactId"
                          class="link-search-row"
                          @click="linkExistingCustomer(call, r)"
                        >
                          <strong>{{ r.fullName || 'Chưa rõ tên' }}</strong>
                          <small>{{ displayPhone(r.phone) }}</small>
                        </button>
                      </v-card>
                    </v-menu>
                  </div>
                </td>
              </tr>
              <tr v-if="playingId === call.id && recordingUrl(call)" class="recording-row">
                <td :colspan="columnCount">
                  <div class="recording-player">
                    <span><v-icon icon="mdi-waveform" /> Bản ghi âm cuộc gọi</span>
                    <span v-if="recordingLoading">Đang tải…</span>
                    <span v-else-if="recordingLoadError" class="recording-error">{{ recordingLoadError }}</span>
                    <template v-else-if="recordingBlobUrl">
                      <audio controls autoplay preload="metadata" :src="recordingBlobUrl" />
                      <button type="button" class="recording-download-btn" @click="downloadRecording(call.id)">
                        <v-icon icon="mdi-download" size="17" /> Tải về
                      </button>
                    </template>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

      <footer class="pagination">
        <span>Hiển thị {{ pageStart }}–{{ pageEnd }} trong {{ number(pagination.total) }} cuộc gọi</span>
        <div>
          <button :disabled="pagination.page <= 1 || loading" @click="goPage(pagination.page - 1)">
            <v-icon icon="mdi-chevron-left" />
          </button>
          <span>Trang {{ pagination.page }} / {{ Math.max(pagination.totalPages, 1) }}</span>
          <button :disabled="!pagination.hasMore || loading" @click="goPage(pagination.page + 1)">
            <v-icon icon="mdi-chevron-right" />
          </button>
        </div>
      </footer>
    </section>

    <AddCustomerQuickDialog
      v-model="showCreateCustomer"
      lead-source="call_history"
      :default-phone="creatingForCall ? displayPhone(creatingForCall.externalNumber) : ''"
      :auto-open-virtual-chat="false"
      @created="onCustomerCreated"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { api } from '@/api';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/composables/use-toast';
import { useOmicallSoftphone } from '@/composables/use-omicall-softphone';
import CallButton from '@/components/telephony/CallButton.vue';
import CallNotesPanel from '@/components/telephony/CallNotesPanel.vue';
import AddCustomerQuickDialog from '@/components/contacts/AddCustomerQuickDialog.vue';

interface CallItem {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  channel: 'internal' | 'pstn' | 'zcc';
  startedAt: string;
  durationSec?: number | null;
  externalNumber?: string | null;
  recordingId?: string | null;
  ownerUser?: { id: string; fullName: string; avatarUrl?: string | null } | null;
  contact?: { id: string; fullName?: string | null; crmName?: string | null; phone?: string | null } | null;
  peerUser?: { id: string; fullName: string; avatarUrl?: string | null } | null;
  latestNote?: { id: string; body: string; createdAt: string; author: { id: string; fullName: string } } | null;
}

interface Summary {
  total: number;
  missed: number;
  recordings: number;
  totalDurationSec: number;
}

const auth = useAuthStore();
const toast = useToast();
const { peers } = useOmicallSoftphone();
const canViewOrganization = computed(() => auth.isAdmin);
const calls = ref<CallItem[]>([]);
const users = ref<Array<{ id: string; fullName: string }>>([]);
const loading = ref(false);
const syncing = ref(false);
const errorMessage = ref('');
const playingId = ref<string | null>(null);
const summary = reactive<Summary>({ total: 0, missed: 0, recordings: 0, totalDurationSec: 0 });
const pagination = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0, hasMore: false });

function ymd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initialDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: ymd(from), to: ymd(to) };
}

const defaults = initialDates();
const filters = reactive({
  search: '',
  scope: canViewOrganization.value ? 'organization' : 'mine',
  ownerUserId: '',
  direction: '',
  status: '',
  channel: '',
  recording: false,
  from: defaults.from,
  to: defaults.to,
});

const columnCount = computed(() => canViewOrganization.value && filters.scope === 'organization' ? 10 : 9);
const pageStart = computed(() => pagination.total ? (pagination.page - 1) * pagination.pageSize + 1 : 0);
const pageEnd = computed(() => Math.min(pagination.page * pagination.pageSize, pagination.total));

function isoStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function isoEnd(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

async function loadCalls(page = pagination.page) {
  loading.value = true;
  errorMessage.value = '';
  playingId.value = null;
  try {
    const { data } = await api.get('/telephony/calls', {
      params: {
        page,
        pageSize: pagination.pageSize,
        scope: filters.scope,
        ownerUserId: filters.scope === 'organization' ? filters.ownerUserId || undefined : undefined,
        direction: filters.direction || undefined,
        status: filters.status || undefined,
        channel: filters.channel || undefined,
        recording: filters.recording ? 'true' : undefined,
        from: isoStart(filters.from),
        to: isoEnd(filters.to),
        search: filters.search.trim() || undefined,
      },
    });
    calls.value = data.calls || [];
    Object.assign(summary, data.summary || {});
    Object.assign(pagination, data.pagination || {});
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || 'Không tải được lịch sử cuộc gọi';
  } finally {
    loading.value = false;
  }
}

async function loadUsers() {
  if (!canViewOrganization.value) return;
  try {
    const { data } = await api.get('/users');
    users.value = (data.users || []).filter((user: any) => user.isActive).map((user: any) => ({
      id: user.id,
      fullName: user.fullName,
    }));
  } catch {
    users.value = [];
  }
}

function applyFilters() {
  pagination.page = 1;
  void loadCalls(1);
}

function scopeChanged() {
  filters.ownerUserId = '';
  applyFilters();
}

function resetFilters() {
  const dates = initialDates();
  Object.assign(filters, {
    search: '',
    scope: canViewOrganization.value ? 'organization' : 'mine',
    ownerUserId: '',
    direction: '',
    status: '',
    channel: '',
    recording: false,
    from: dates.from,
    to: dates.to,
  });
  applyFilters();
}

function goPage(page: number) {
  pagination.page = page;
  void loadCalls(page);
}

async function syncOmicall() {
  syncing.value = true;
  try {
    const { data } = await api.post('/telephony/omicall/sync', { days: 30 });
    toast.success(`Đã đồng bộ ${data.synced ?? 0} cuộc gọi từ tổng đài`);
    await loadCalls(1);
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không đồng bộ được lịch sử tổng đài');
  } finally {
    syncing.value = false;
  }
}

function callName(call: CallItem) {
  return call.contact?.crmName || call.contact?.fullName || call.peerUser?.fullName
    || displayPhone(call.externalNumber) || 'Không rõ khách hàng';
}

// Cuộc gọi nội bộ (channel='internal') không có externalNumber — gọi lại phải qua
// extension của đồng nghiệp (peerUser), không qua callPhone(). Khớp peerUser.id với
// danh sách peers (đã tải sẵn ở softphone toàn cục) để lấy omicallExtension hiện tại.
function callTargetPeer(call: CallItem) {
  if (call.channel !== 'internal' || !call.peerUser) return null;
  return peers.value.find((p) => p.id === call.peerUser!.id) || null;
}

// Số lạ (chưa có KH) → tạo nhanh (dùng lại đúng dialog quick-add có sẵn ở Contacts),
// sau đó gắn ngược contactId vào đúng CallLog đã bấm — không cần sale tự nhớ số rồi
// tự đi tìm/gán tay.
const showCreateCustomer = ref(false);
const creatingForCall = ref<CallItem | null>(null);

function openCreateCustomer(call: CallItem) {
  creatingForCall.value = call;
  showCreateCustomer.value = true;
}

async function onCustomerCreated(contact: { id: string; fullName: string | null; phone: string | null }) {
  const call = creatingForCall.value;
  showCreateCustomer.value = false;
  creatingForCall.value = null;
  if (!call) return;
  try {
    await api.patch(`/telephony/calls/${call.id}`, { contactId: contact.id });
    const row = calls.value.find((c) => c.id === call.id);
    if (row) row.contact = { id: contact.id, fullName: contact.fullName || undefined, phone: contact.phone || undefined };
    toast.success(`Đã tạo và gắn "${contact.fullName || contact.phone}" vào cuộc gọi này`);
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Đã tạo khách hàng nhưng không gắn được vào cuộc gọi');
  }
}

function onNoteSaved(call: CallItem, note: { id: string; body: string; createdAt: string; author: { id: string; fullName: string } }) {
  call.latestNote = note;
}

// Gắn vào KH ĐÃ CÓ SẴN (khác "Tạo khách hàng" ở trên — dùng khi số này thực ra là 1 SĐT
// khác của KH đã tồn tại, không phải khách mới). Tái dùng đúng endpoint gợi ý dial-suggestions
// (đã có search tên/SĐT) thay vì xây API tìm kiếm riêng.
interface LinkSearchResult { contactId: string; fullName: string | null; phone: string }
const linkSearch = ref('');
const linkSearchLoading = ref(false);
const linkSearchResults = ref<LinkSearchResult[]>([]);
let linkSearchDebounce: ReturnType<typeof setTimeout> | null = null;

function onLinkSearchInput() {
  if (linkSearchDebounce) clearTimeout(linkSearchDebounce);
  const q = linkSearch.value.trim();
  if (q.length < 2) { linkSearchResults.value = []; return; }
  linkSearchLoading.value = true;
  linkSearchDebounce = setTimeout(async () => {
    try {
      const { data } = await api.get('/telephony/dial-suggestions', { params: { q } });
      linkSearchResults.value = data.suggestions || [];
    } catch {
      linkSearchResults.value = [];
    } finally {
      linkSearchLoading.value = false;
    }
  }, 250);
}

async function linkExistingCustomer(call: CallItem, result: LinkSearchResult) {
  try {
    await api.patch(`/telephony/calls/${call.id}`, { contactId: result.contactId });
    const row = calls.value.find((c) => c.id === call.id);
    if (row) row.contact = { id: result.contactId, fullName: result.fullName || undefined, phone: result.phone };
    toast.success(`Đã gắn "${result.fullName || result.phone}" vào cuộc gọi này`);
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không gắn được khách hàng vào cuộc gọi');
  } finally {
    linkSearch.value = '';
    linkSearchResults.value = [];
  }
}

function displayPhone(value?: string | null) {
  if (!value) return '';
  return /^84\d{9,10}$/.test(value) ? `0${value.slice(2)}` : value;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts.at(-2)?.[0]}${parts.at(-1)?.[0]}` : value.slice(0, 2)).toUpperCase();
}

function recordingUrl(call: CallItem) {
  const url = call.recordingId?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

// Phát/tải ghi âm QUA cổng CRM có auth (/telephony/calls/:id/recording), KHÔNG dùng thẳng
// URL kho lưu trữ (recordingId) — URL kho không có auth, ai có link cũng tải được. Fetch
// blob rồi tạo object URL cho <audio>, cùng pattern tải file đã dùng ở message-bubble.vue.
const recordingBlobUrl = ref<string | null>(null);
const recordingLoading = ref(false);
const recordingLoadError = ref('');

function revokeRecordingBlob() {
  if (recordingBlobUrl.value) URL.revokeObjectURL(recordingBlobUrl.value);
  recordingBlobUrl.value = null;
}

async function toggleRecording(id: string) {
  if (playingId.value === id) {
    playingId.value = null;
    revokeRecordingBlob();
    return;
  }
  revokeRecordingBlob();
  playingId.value = id;
  recordingLoadError.value = '';
  recordingLoading.value = true;
  try {
    const res = await api.get(`/telephony/calls/${id}/recording`, { responseType: 'blob', timeout: 30000 });
    recordingBlobUrl.value = URL.createObjectURL(res.data as Blob);
  } catch (e: any) {
    const status = e?.response?.status;
    recordingLoadError.value = status === 410
      ? 'Ghi âm không còn khả dụng (đã hết hạn hoặc bị xóa khỏi kho lưu trữ).'
      : status === 404
        ? 'Cuộc gọi này không có ghi âm.'
        : 'Không tải được ghi âm, thử lại sau ít giây.';
  } finally {
    recordingLoading.value = false;
  }
}

function downloadRecording(id: string) {
  if (!recordingBlobUrl.value) return;
  const a = document.createElement('a');
  a.href = recordingBlobUrl.value;
  a.download = `cuoc-goi-${id}.mp3`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

onUnmounted(revokeRecordingBlob);

function number(value: number) {
  return Number(value || 0).toLocaleString('vi-VN');
}

function duration(seconds: number, compact = false) {
  const value = Math.max(0, Number(seconds) || 0);
  if (compact) {
    const minutes = Math.floor(value / 60);
    return `${String(minutes).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return hours ? `${hours}g ${minutes}p` : `${minutes} phút`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return ({
    initiated: 'Đang khởi tạo',
    ringing: 'Đang đổ chuông',
    answered: 'Đã trả lời',
    completed: 'Hoàn thành',
    missed: 'Gọi nhỡ',
    rejected: 'Từ chối',
    failed: 'Thất bại',
  } as Record<string, string>)[status] || status;
}

function channelLabel(channel: string) {
  return ({ zcc: 'Zalo OA', pstn: 'Điện thoại', internal: 'Nội bộ' } as Record<string, string>)[channel] || channel;
}

onMounted(() => {
  void Promise.all([loadCalls(1), loadUsers()]);
});
</script>

<style scoped>
.call-page {
  /* App khoá cuộn cấp trang (main.css: html,body { overflow:hidden }), giống
     ContactsView: page cố định chiều cao, header/summary/filters/pagination
     đứng yên (flex-shrink:0), chỉ .table-wrap bên trong cuộn. */
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--smax-topnav-h, 48px));
  overflow: hidden;
  padding: 16px 20px;
  background: #f5f7f7;
  color: #17212b;
}
.call-page > .page-head,
.call-page > .summary-grid {
  flex-shrink: 0;
}
.call-page > .history-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.history-panel > .filters,
.history-panel > .error-banner,
.history-panel > .pagination {
  flex-shrink: 0;
}
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin: 0 0 16px; }
.eyebrow { margin: 0 0 6px; color: #148271; font-size: 11px; font-weight: 800; letter-spacing: .14em; }
h1 { margin: 0; font-size: clamp(26px, 3vw, 34px); letter-spacing: -.035em; }
.subtitle { margin: 7px 0 0; color: #6b787e; }
.sync-btn, .apply-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 10px; padding: 11px 16px; background: #147d70; color: #fff; font-weight: 750; cursor: pointer; }
.sync-btn:disabled { opacity: .6; cursor: wait; }
.spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 0 0 16px; }
.summary-card { min-height: 104px; padding: 19px; display: flex; align-items: center; gap: 14px; border: 1px solid #e2e8e8; border-radius: 14px; background: #fff; }
.summary-card div { display: grid; gap: 3px; }
.summary-card strong { font-size: 24px; letter-spacing: -.03em; }
.summary-card div span { color: #748086; font-size: 13px; }
.summary-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 11px; }
.summary-icon.teal { background: #e1f3ef; color: #147d70; }
.summary-icon.blue { background: #e7f1f8; color: #176d9a; }
.summary-icon.red { background: #fceceb; color: #b94b4b; }
.summary-icon.amber { background: #fff3d9; color: #a36d12; }
.history-panel { overflow: hidden; border: 1px solid #e1e7e7; border-radius: 15px; background: #fff; }
.filters { padding: 16px; display: flex; align-items: center; gap: 9px; flex-wrap: wrap; border-bottom: 1px solid #e8eded; background: #fbfcfc; }
.filters select, .filters input { border: 1px solid #d9e1e1; border-radius: 9px; background: #fff; color: #26343a; outline: none; }
.filters select { height: 40px; padding: 0 31px 0 11px; }
.search-field { height: 40px; min-width: 290px; flex: 1 1 300px; display: flex; align-items: center; gap: 8px; padding: 0 11px; border: 1px solid #d9e1e1; border-radius: 9px; background: #fff; color: #718087; }
.search-field input { min-width: 0; flex: 1; border: 0; }
.date-field { height: 40px; display: flex; align-items: center; gap: 7px; padding-left: 10px; border: 1px solid #d9e1e1; border-radius: 9px; background: #fff; color: #758187; font-size: 12px; }
.date-field input { height: 38px; border: 0; padding-right: 7px; }
.recording-filter { height: 40px; display: flex; align-items: center; gap: 7px; padding: 0 10px; color: #536168; font-size: 13px; white-space: nowrap; }
.recording-filter input { accent-color: #147d70; }
.apply-btn { height: 40px; padding: 0 17px; }
.reset-btn { width: 40px; height: 40px; border: 1px solid #d9e1e1; border-radius: 9px; background: #fff; color: #66747a; cursor: pointer; }
.error-banner { margin: 16px; padding: 12px 14px; display: flex; align-items: center; gap: 9px; border-radius: 9px; background: #fff0ef; color: #a83f3f; }
.error-banner span { flex: 1; }
.error-banner button { border: 0; background: none; color: inherit; font-weight: 700; cursor: pointer; }
.table-wrap { flex: 1; min-height: 0; overflow: auto; }
table { width: 100%; min-width: 1250px; border-collapse: collapse; }
th { padding: 12px 15px; background: #f7f9f9; color: #69777d; font-size: 11px; font-weight: 800; letter-spacing: .035em; text-align: left; text-transform: uppercase; position: sticky; top: 0; z-index: 5; }
td { padding: 14px 15px; border-top: 1px solid #edf1f1; color: #46545a; font-size: 13px; vertical-align: middle; }
tbody tr:not(.recording-row):hover { background: #fbfdfc; }
.customer-cell { display: flex; align-items: center; gap: 10px; min-width: 210px; }
.customer-cell .avatar { width: 35px; height: 35px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; background: #deefeb; color: #176f63; font-size: 11px; font-weight: 800; }
.customer-cell div { display: grid; gap: 2px; }
.customer-cell strong, .agent-name { color: #253238; font-weight: 700; }
.customer-cell span { color: #819096; font-size: 12px; }
.direction { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.channel, .status { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 8px; font-size: 11px; font-weight: 750; white-space: nowrap; }
.channel.zcc { background: #e6f3ff; color: #1168ad; }
.channel.pstn { background: #edf4f2; color: #417266; }
.channel.internal { background: #f1ecfb; color: #7155a5; }
.status.completed, .status.answered { background: #e6f5ec; color: #287b4c; }
.status.missed, .status.failed, .status.rejected { background: #fdeceb; color: #b34848; }
.status.initiated, .status.ringing { background: #fff4d9; color: #9a6a18; }
.play-btn { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #b8dcd4; border-radius: 8px; padding: 6px 9px; background: #f1faf8; color: #147d70; font-weight: 700; cursor: pointer; }
.play-btn.active { background: #147d70; color: #fff; }
.no-recording { color: #9ba5a9; font-size: 12px; }
.note-btn { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #d9e1e1; border-radius: 8px; padding: 6px 9px; background: #fff; color: #536168; font-weight: 700; font-size: 11px; cursor: pointer; }
.note-menu-card { padding: 12px; }
.row-actions { display: flex; align-items: center; gap: 6px; }
.link-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid #d9e1e1; border-radius: 50%; background: #fff; color: #536168; cursor: pointer; }
.link-menu-card { padding: 10px; width: 260px; }
.link-search-input { width: 100%; border: 1px solid #d9e1e1; border-radius: 8px; padding: 7px 10px; font-size: 13px; outline: none; margin-bottom: 6px; }
.link-search-state { padding: 8px 4px; color: #8b979c; font-size: 12px; }
.link-search-row { width: 100%; display: flex; flex-direction: column; gap: 1px; padding: 7px 8px; border: 0; border-radius: 6px; background: #fff; cursor: pointer; text-align: left; }
.link-search-row:hover { background: #f5f7f7; }
.link-search-row strong { font-size: 12.5px; color: #253238; }
.link-search-row small { font-size: 11px; color: #8b979c; }
.recording-row td { padding: 0 15px 14px; background: #fbfdfc; }
.recording-player { padding: 12px 14px; display: flex; align-items: center; gap: 16px; border-radius: 10px; background: #edf7f4; }
.recording-player > span { display: flex; align-items: center; gap: 6px; color: #306d62; font-weight: 700; white-space: nowrap; }
.recording-player audio { height: 36px; flex: 1; min-width: 220px; }
.recording-player a, .recording-download-btn { display: inline-flex; align-items: center; gap: 5px; color: #147d70; font-weight: 700; text-decoration: none; white-space: nowrap; border: none; background: none; cursor: pointer; font: inherit; padding: 0; }
.recording-error { color: #b3453b; font-weight: 600; }
.state-cell, .empty-cell { height: 240px; text-align: center; color: #758187; }
.state-cell > * { margin-right: 8px; }
.empty-cell > * { display: block; margin: 6px auto; }
.empty-cell strong { color: #39474d; font-size: 15px; }
.pagination { min-height: 58px; padding: 10px 15px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-top: 1px solid #e8eded; color: #718087; font-size: 12px; }
.pagination div { display: flex; align-items: center; gap: 10px; }
.pagination button { width: 34px; height: 34px; border: 1px solid #d9e1e1; border-radius: 8px; background: #fff; color: #4f5e64; cursor: pointer; }
.pagination button:disabled { opacity: .4; cursor: default; }
@media (max-width: 900px) {
  .call-page { padding: 20px 12px 34px; }
  .page-head { align-items: flex-start; flex-direction: column; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-card { min-height: 86px; padding: 14px; }
  .filters { align-items: stretch; }
  .filters select, .date-field, .recording-filter, .apply-btn { flex: 1 1 150px; }
  .pagination { align-items: flex-start; flex-direction: column; }
}
@media (max-width: 520px) {
  .summary-grid { grid-template-columns: 1fr; }
  .sync-btn { width: 100%; }
  .search-field { min-width: 100%; }
}
</style>
