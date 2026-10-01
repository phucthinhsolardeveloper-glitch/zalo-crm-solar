<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<!--
  BroadcastsView — Phase 2 (mục C, 2026-09-30): giao diện tạo/theo dõi chiến
  dịch gửi hàng loạt từ nick cá nhân. Backend Phase 1 đã xong (broadcast-routes.ts,
  broadcast-worker.ts) — xem docs/13-handoffs/2026-09-30-broadcast-phase1.md.
  Phase 3a (2026-10-01): thêm ảnh/album (attachmentAssetIds, chọn từ Kho media
  hoặc tải mới). Giới hạn còn lại: đối tượng chọn tay (contactIds cố định),
  1 broadcast = 1 nick, chưa hỗ trợ video/file.
-->
<template>
  <div class="bc-view">
    <div class="mkt-top">
      <div>
        <div class="mtt">Gửi hàng loạt</div>
        <div class="mts">
          Gửi tin từ 1 nick cá nhân cho danh sách khách hàng đã chọn — có giới hạn
          riêng ({{ CAMPAIGN_QUOTA_HINT }}), tách biệt hoàn toàn với tin nhắn trả lời
          khách hàng ngày thường. Chỉ gửi được cho khách <b>đã kết bạn</b> hoặc
          <b>đã từng nhắn qua lại</b> với đúng nick — không gửi cho người hoàn toàn xa lạ.
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" @click="openCreate">
          <v-icon size="16">mdi-plus-circle-outline</v-icon> Tạo chiến dịch
        </button>
      </div>
    </div>

    <div class="mkt-body">
      <div v-if="loading" class="bc-loading">Đang tải...</div>
      <div v-else-if="broadcasts.length === 0" class="bc-empty">
        Chưa có chiến dịch nào. Bấm "Tạo chiến dịch" để bắt đầu.
      </div>
      <table v-else class="bc-table">
        <thead>
          <tr>
            <th>Tên chiến dịch</th>
            <th>Trạng thái</th>
            <th>Tiến độ</th>
            <th>Nhịp gửi</th>
            <th>Bỏ qua</th>
            <th>Tạo lúc</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in broadcasts" :key="b.id">
            <td class="bc-name">{{ b.name }}</td>
            <td><span class="bc-pill" :class="'st-' + b.state">{{ stateLabel(b.state) }}</span></td>
            <td class="num">{{ b.sentCount }}/{{ b.totalRecipients }}</td>
            <td class="num">{{ pacingLabel(b) }}</td>
            <td class="num">{{ skippedCount(b) }}</td>
            <td>{{ formatDate(b.createdAt) }}</td>
            <td class="bc-actions">
              <button v-if="b.state === 'draft' || b.state === 'paused'" class="btn btn-ghost btn-xs" @click="start(b)">
                <v-icon size="14">mdi-play</v-icon> {{ b.state === 'paused' ? 'Tiếp tục' : 'Bắt đầu' }}
              </button>
              <button v-if="b.state === 'running'" class="btn btn-ghost btn-xs" @click="pause(b)">
                <v-icon size="14">mdi-pause</v-icon> Tạm dừng
              </button>
              <button v-if="b.state !== 'completed' && b.state !== 'cancelled'" class="btn btn-ghost btn-xs danger" @click="cancel(b)">
                <v-icon size="14">mdi-close</v-icon> Huỷ
              </button>
              <span v-if="b.workerStats?.lastError" class="bc-lasterror" :title="b.workerStats.lastError">
                <v-icon size="14">mdi-alert-outline</v-icon>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ============ Create dialog ============ -->
    <div v-if="showCreate" class="bc-overlay" @click.self="closeCreate">
      <div class="bc-dialog">
        <header class="bc-dialog-head">
          <span>Tạo chiến dịch gửi hàng loạt</span>
          <button class="bc-x" @click="closeCreate"><v-icon size="18">mdi-close</v-icon></button>
        </header>

        <div class="bc-dialog-body">
          <label class="bc-field">
            <span class="bc-label">Tên chiến dịch</span>
            <input v-model="form.name" class="bc-input" placeholder="VD: Khuyến mãi tháng 10" />
          </label>

          <label class="bc-field">
            <span class="bc-label">Gửi từ nick</span>
            <select v-model="form.nickId" class="bc-input">
              <option value="" disabled>Chọn nick Zalo</option>
              <option v-for="n in connectedNicks" :key="n.id" :value="n.id">
                {{ n.displayName || n.phone || n.id }} — {{ n.liveStatus === 'connected' ? 'Đang kết nối' : n.liveStatus }}
              </option>
            </select>
          </label>

          <label class="bc-field">
            <span class="bc-label">Nội dung tin nhắn</span>
            <textarea v-model="form.messageText" class="bc-input bc-textarea" rows="4" placeholder="Nội dung sẽ gửi cho tất cả người nhận bên dưới (có thể để trống nếu chỉ gửi ảnh)..."></textarea>
          </label>

          <div class="bc-field">
            <span class="bc-label">Ảnh đính kèm ({{ form.attachments.length }}/{{ MAX_ATTACHMENTS }})</span>
            <div class="bc-attach-row">
              <label class="btn btn-ghost btn-sm bc-upload-btn">
                <v-icon size="16">mdi-upload</v-icon> Tải ảnh mới
                <input type="file" accept="image/*" multiple hidden @change="onUploadFiles" />
              </label>
              <button type="button" class="btn btn-ghost btn-sm" @click="openImagePicker">
                <v-icon size="16">mdi-image-multiple-outline</v-icon> Chọn từ kho
              </button>
              <span v-if="uploading" class="bc-help">Đang tải lên...</span>
            </div>
            <div v-if="form.attachments.length" class="bc-attach-thumbs">
              <div v-for="a in form.attachments" :key="a.id" class="bc-thumb">
                <img :src="a.thumbnailUrl || a.url || undefined" :alt="a.name" />
                <button type="button" class="bc-thumb-x" @click="removeAttachment(a.id)"><v-icon size="12">mdi-close</v-icon></button>
              </div>
            </div>
            <span v-if="form.attachments.length > 1" class="bc-help">{{ form.attachments.length }} ảnh sẽ gửi gộp thành 1 album.</span>
          </div>

          <!-- Picker chọn ảnh có sẵn trong Kho media -->
          <div v-if="showImagePicker" class="bc-picker-overlay" @click.self="showImagePicker = false">
            <div class="bc-picker">
              <header class="bc-dialog-head">
                <span>Chọn ảnh từ Kho</span>
                <button class="bc-x" @click="showImagePicker = false"><v-icon size="18">mdi-close</v-icon></button>
              </header>
              <div class="bc-picker-body">
                <div v-if="libraryLoading" class="bc-loading">Đang tải...</div>
                <div v-else-if="libraryImages.length === 0" class="bc-empty">Kho chưa có ảnh nào.</div>
                <div v-else class="bc-picker-grid">
                  <div
                    v-for="img in libraryImages"
                    :key="img.id"
                    class="bc-picker-item"
                    :class="{ selected: isSelected(img.id) }"
                    @click="toggleLibraryImage(img)"
                  >
                    <img :src="img.thumbnailUrl || img.url || undefined" :alt="img.name" />
                    <v-icon v-if="isSelected(img.id)" size="18" class="bc-picker-check">mdi-check-circle</v-icon>
                  </div>
                </div>
              </div>
              <footer class="bc-dialog-foot">
                <button class="btn btn-primary btn-sm" @click="showImagePicker = false">Xong ({{ form.attachments.length }} đã chọn)</button>
              </footer>
            </div>
          </div>

          <!-- Picker chọn NHIỀU người nhận cùng lúc bằng tick-list (thay vì phải gõ
               tìm từng người 1 — phản hồi user 2026-10-01: ô gõ-tìm-1-người-1-lần
               "làm khó nhau" khi cần chọn nhiều người). -->
          <div v-if="showContactPicker" class="bc-picker-overlay" @click.self="showContactPicker = false">
            <div class="bc-picker bc-contact-picker">
              <header class="bc-dialog-head">
                <span>Chọn người nhận</span>
                <button class="bc-x" @click="showContactPicker = false"><v-icon size="18">mdi-close</v-icon></button>
              </header>
              <div class="bc-picker-search">
                <input v-model="contactPickerQuery" class="bc-input" placeholder="Lọc theo tên/SĐT..." @input="onContactPickerSearch" />
              </div>
              <div class="bc-picker-body bc-contact-list">
                <div v-if="contactPickerLoading && contactPickerItems.length === 0" class="bc-loading">Đang tải...</div>
                <div v-else-if="contactPickerItems.length === 0" class="bc-empty">Không có khách hàng nào khớp.</div>
                <label v-for="c in contactPickerItems" :key="c.id" class="bc-contact-row">
                  <input type="checkbox" :checked="isContactSelected(c.id)" @change="toggleContactPicked(c)" />
                  <span class="bc-contact-name">{{ c.crmName || c.fullName || '(chưa đặt tên)' }}</span>
                  <span class="bc-sub">{{ c.phone }}</span>
                </label>
                <button
                  v-if="contactPickerHasMore"
                  type="button"
                  class="btn btn-ghost btn-sm bc-loadmore"
                  :disabled="contactPickerLoading"
                  @click="loadMoreContactPicker"
                >
                  {{ contactPickerLoading ? 'Đang tải...' : 'Tải thêm' }}
                </button>
              </div>
              <footer class="bc-dialog-foot">
                <button class="btn btn-primary btn-sm" @click="showContactPicker = false">Xong ({{ form.contacts.length }} đã chọn)</button>
              </footer>
            </div>
          </div>

          <div class="bc-grid">
            <label class="bc-field">
              <span class="bc-label">Số người mỗi đợt</span>
              <input v-model.number="form.batchSize" class="bc-input" type="number" min="1" max="50" />
              <span class="bc-help">Tối đa 50 người/lượt.</span>
            </label>
            <label class="bc-field">
              <span class="bc-label">Khoảng cách giữa các đợt (giây)</span>
              <input v-model.number="form.intervalSec" class="bc-input" type="number" min="30" max="86400" />
              <span class="bc-help">Tối thiểu 30 giây.</span>
            </label>
          </div>

          <label class="bc-field">
            <span class="bc-label">Bắt đầu lúc (tuỳ chọn)</span>
            <input v-model="form.startAt" class="bc-input" type="datetime-local" />
            <span class="bc-help">Để trống để bấm “Bắt đầu” là gửi ngay.</span>
          </label>

          <div class="bc-field">
            <span class="bc-label">Người nhận ({{ form.contacts.length }} đã chọn)</span>
            <div class="bc-attach-row">
              <input v-model="contactQuery" class="bc-input" style="flex:1" placeholder="Gõ tên/SĐT để tìm nhanh 1 khách..." @input="onSearchContacts" />
              <button type="button" class="btn btn-ghost btn-sm" @click="openContactPicker">
                <v-icon size="16">mdi-format-list-checks</v-icon> Chọn từ danh sách
              </button>
            </div>
            <div v-if="contactSuggestions.length" class="bc-suggestions">
              <div
                v-for="c in contactSuggestions"
                :key="c.id"
                class="bc-suggestion-row"
                @click="addContact(c)"
              >
                <span>{{ c.crmName || c.fullName || '(chưa đặt tên)' }}</span>
                <span class="bc-sub">{{ c.phone }}</span>
              </div>
            </div>
            <div v-if="form.contacts.length" class="bc-selected-list">
              <span v-for="c in form.contacts" :key="c.id" class="bc-chip">
                {{ c.crmName || c.fullName || c.phone }}
                <button @click="removeContact(c.id)"><v-icon size="12">mdi-close</v-icon></button>
              </span>
            </div>
          </div>

          <div v-if="createError" class="bc-error">{{ createError }}</div>
        </div>

        <footer class="bc-dialog-foot">
          <button class="btn btn-ghost btn-sm" @click="closeCreate">Huỷ</button>
          <button class="btn btn-primary btn-sm" :disabled="creating || !canSubmit" @click="submitCreate">
            {{ creating ? 'Đang tạo...' : 'Tạo chiến dịch' }}
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/api/index';
import { useToast } from '@/composables/use-toast';

const toast = useToast();

const CAMPAIGN_QUOTA_HINT = 'mặc định 50 tin/ngày/nick, chỉnh được ở Quản lý nick Zalo';

interface BroadcastRow {
  id: string; name: string; state: string;
  sentCount: number; failedCount: number; totalRecipients: number;
  scheduledAt?: string | null;
  pacing?: { batchSize?: number; intervalSec?: number } | null;
  createdAt: string;
  workerStats?: { skipped?: unknown[]; lastError?: string | null } | null;
}
interface NickOption { id: string; displayName: string | null; phone: string | null; liveStatus?: string; status: string }
interface ContactOption { id: string; fullName: string | null; crmName: string | null; phone: string | null }
interface MediaItem { id: string; name: string; url: string | null; thumbnailUrl: string | null }

const MAX_ATTACHMENTS = 12; // khớp giới hạn backend (broadcast-routes.ts)

const loading = ref(false);
const broadcasts = ref<BroadcastRow[]>([]);
const nicks = ref<NickOption[]>([]);

// Chỉ cho chọn nick đang sống trong pool. Nick DB còn record nhưng đã mất
// session sẽ khiến worker pause ngay ở tick đầu tiên, nên không được hiện như
// một sender hợp lệ trong form tạo chiến dịch.
const connectedNicks = computed(() => nicks.value.filter((nick) => nick.liveStatus === 'connected'));

async function loadBroadcasts() {
  loading.value = true;
  try {
    const { data } = await api.get('/broadcasts');
    broadcasts.value = data;
  } catch (err) {
    console.error('load broadcasts failed', err);
  } finally {
    loading.value = false;
  }
}

async function loadNicks() {
  try {
    const { data } = await api.get('/zalo-accounts');
    nicks.value = data;
  } catch (err) {
    console.error('load nicks failed', err);
  }
}

function stateLabel(s: string): string {
  return ({
    draft: 'Nháp', running: 'Đang gửi', paused: 'Tạm dừng',
    completed: 'Hoàn tất', cancelled: 'Đã huỷ', scheduled: 'Đã lên lịch',
  } as Record<string, string>)[s] ?? s;
}
function skippedCount(b: BroadcastRow): number {
  return b.workerStats?.skipped?.length ?? 0;
}
function pacingLabel(b: BroadcastRow): string {
  const batch = Number(b.pacing?.batchSize ?? 5);
  const interval = Number(b.pacing?.intervalSec ?? 60);
  return `${batch}/${interval}s`;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function start(b: BroadcastRow) {
  try {
    await api.post(`/broadcasts/${b.id}/start`);
    toast.success('Đã bắt đầu gửi');
    await loadBroadcasts();
  } catch (err: any) {
    toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Không bắt đầu được');
  }
}
async function pause(b: BroadcastRow) {
  await api.post(`/broadcasts/${b.id}/pause`);
  toast.success('Đã tạm dừng');
  await loadBroadcasts();
}
async function cancel(b: BroadcastRow) {
  if (!confirm(`Huỷ chiến dịch "${b.name}"? Không thể hoàn tác.`)) return;
  await api.post(`/broadcasts/${b.id}/cancel`);
  toast.success('Đã huỷ chiến dịch');
  await loadBroadcasts();
}

// ── Create dialog ──────────────────────────────────────────────────────────
const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const contactQuery = ref('');
const contactSuggestions = ref<ContactOption[]>([]);

const form = ref({
  name: '',
  nickId: '',
  messageText: '',
  contacts: [] as ContactOption[],
  attachments: [] as MediaItem[],
  batchSize: 5,
  intervalSec: 60,
  startAt: '',
});

const canSubmit = computed(() =>
  form.value.name.trim().length > 0 &&
  form.value.nickId.length > 0 &&
  (form.value.messageText.trim().length > 0 || form.value.attachments.length > 0) &&
  form.value.contacts.length > 0,
);

function openCreate() {
  form.value = { name: '', nickId: '', messageText: '', contacts: [], attachments: [], batchSize: 5, intervalSec: 60, startAt: '' };
  contactQuery.value = '';
  contactSuggestions.value = [];
  contactPickerItems.value = [];
  contactPickerQuery.value = '';
  createError.value = '';
  showCreate.value = true;
}
function closeCreate() {
  showCreate.value = false;
}

// ── Ảnh đính kèm (Phase 3a, 2026-10-01) — tải mới hoặc chọn từ Kho media ────
const uploading = ref(false);
const showImagePicker = ref(false);
const libraryLoading = ref(false);
const libraryImages = ref<MediaItem[]>([]);

function removeAttachment(id: string) {
  form.value.attachments = form.value.attachments.filter((a) => a.id !== id);
}

async function onUploadFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (files.length === 0) return;
  uploading.value = true;
  try {
    for (const file of files) {
      if (form.value.attachments.length >= MAX_ATTACHMENTS) {
        toast.error(`Tối đa ${MAX_ATTACHMENTS} ảnh/chiến dịch`);
        break;
      }
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/media/upload', fd);
      const assetId = data?.assets?.[0]?.id;
      if (!assetId) continue;
      // Ảnh mới tải chưa có trong libraryImages — dùng preview local tạm thời
      // (object URL) cho tới khi picker "Kho" load lại; đủ để xem trước ngay.
      form.value.attachments.push({ id: assetId, name: file.name, url: URL.createObjectURL(file), thumbnailUrl: null });
    }
  } catch (err: any) {
    toast.error(err?.response?.data?.error || 'Tải ảnh lên thất bại');
  } finally {
    uploading.value = false;
  }
}

function isSelected(id: string): boolean {
  return form.value.attachments.some((a) => a.id === id);
}
function toggleLibraryImage(img: MediaItem) {
  if (isSelected(img.id)) {
    removeAttachment(img.id);
    return;
  }
  if (form.value.attachments.length >= MAX_ATTACHMENTS) {
    toast.error(`Tối đa ${MAX_ATTACHMENTS} ảnh/chiến dịch`);
    return;
  }
  form.value.attachments.push(img);
}

async function openImagePicker() {
  showImagePicker.value = true;
  if (libraryImages.value.length > 0) return;
  libraryLoading.value = true;
  try {
    const { data } = await api.get('/media', { params: { kind: 'image', limit: 60 } });
    libraryImages.value = data.items ?? [];
  } catch (err) {
    console.error('load media library failed', err);
  } finally {
    libraryLoading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearchContacts() {
  if (searchTimer) clearTimeout(searchTimer);
  const q = contactQuery.value.trim();
  if (!q) { contactSuggestions.value = []; return; }
  searchTimer = setTimeout(async () => {
    try {
      const { data } = await api.get('/contacts', { params: { search: q, limit: 8 } });
      const rows = Array.isArray(data) ? data : (data.contacts ?? data.items ?? []);
      contactSuggestions.value = rows.filter((c: ContactOption) => !form.value.contacts.some((x) => x.id === c.id));
    } catch (err) {
      console.error('search contacts failed', err);
    }
  }, 300);
}
function addContact(c: ContactOption) {
  if (!form.value.contacts.some((x) => x.id === c.id)) form.value.contacts.push(c);
  contactQuery.value = '';
  contactSuggestions.value = [];
}
function removeContact(id: string) {
  form.value.contacts = form.value.contacts.filter((c) => c.id !== id);
}

// ── Picker chọn nhiều người nhận cùng lúc (tick-list, 2026-10-01) ───────────
const showContactPicker = ref(false);
const contactPickerQuery = ref('');
const contactPickerLoading = ref(false);
const contactPickerItems = ref<ContactOption[]>([]);
const contactPickerPage = ref(1);
const contactPickerHasMore = ref(false);
const CONTACT_PICKER_PAGE_SIZE = 50;

function isContactSelected(id: string): boolean {
  return form.value.contacts.some((c) => c.id === id);
}
function toggleContactPicked(c: ContactOption) {
  if (isContactSelected(c.id)) {
    removeContact(c.id);
  } else {
    form.value.contacts.push(c);
  }
}

async function fetchContactPickerPage(page: number, append: boolean) {
  contactPickerLoading.value = true;
  try {
    const { data } = await api.get('/contacts', {
      params: { search: contactPickerQuery.value.trim(), limit: CONTACT_PICKER_PAGE_SIZE, page, sort: 'name' },
    });
    const rows: ContactOption[] = data.contacts ?? data.items ?? [];
    contactPickerItems.value = append ? [...contactPickerItems.value, ...rows] : rows;
    contactPickerPage.value = page;
    const total = Number(data.total ?? 0);
    contactPickerHasMore.value = contactPickerItems.value.length < total;
  } catch (err) {
    console.error('load contact picker failed', err);
  } finally {
    contactPickerLoading.value = false;
  }
}

function openContactPicker() {
  showContactPicker.value = true;
  contactPickerQuery.value = '';
  void fetchContactPickerPage(1, false);
}

let contactPickerTimer: ReturnType<typeof setTimeout> | null = null;
function onContactPickerSearch() {
  if (contactPickerTimer) clearTimeout(contactPickerTimer);
  contactPickerTimer = setTimeout(() => { void fetchContactPickerPage(1, false); }, 300);
}

function loadMoreContactPicker() {
  void fetchContactPickerPage(contactPickerPage.value + 1, true);
}

async function submitCreate() {
  if (!canSubmit.value) return;
  creating.value = true;
  createError.value = '';
  try {
    await api.post('/broadcasts', {
      name: form.value.name.trim(),
      nickId: form.value.nickId,
      messageText: form.value.messageText.trim(),
      contactIds: form.value.contacts.map((c) => c.id),
      attachmentAssetIds: form.value.attachments.map((a) => a.id),
      batchSize: Number(form.value.batchSize),
      intervalSec: Number(form.value.intervalSec),
      scheduledAt: form.value.startAt ? new Date(form.value.startAt).toISOString() : null,
    });
    toast.success('Đã tạo chiến dịch (đang ở trạng thái Nháp, bấm "Bắt đầu" để gửi)');
    showCreate.value = false;
    await loadBroadcasts();
  } catch (err: any) {
    createError.value = err?.response?.data?.error || 'Tạo chiến dịch thất bại';
  } finally {
    creating.value = false;
  }
}

onMounted(() => {
  void loadBroadcasts();
  void loadNicks();
});
</script>

<style scoped>
.bc-view { padding: 0; }
.bc-loading, .bc-empty { padding: 40px; text-align: center; color: var(--ink-3, #6b7280); }

.bc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.bc-table th { text-align: left; padding: 10px 14px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e5e7eb; }
.bc-table td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
.bc-table .num { font-variant-numeric: tabular-nums; text-align: right; }
.bc-name { font-weight: 600; }

.bc-pill { padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.bc-pill.st-draft { background: #f1f5f9; color: #64748b; }
.bc-pill.st-running { background: #dcfce7; color: #15803d; }
.bc-pill.st-paused { background: #fef3c7; color: #b45309; }
.bc-pill.st-completed { background: #dbeafe; color: #1d4ed8; }
.bc-pill.st-cancelled { background: #fee2e2; color: #b91c1c; }

.bc-actions { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.btn-xs { padding: 4px 8px; font-size: 12px; }
.btn.danger { color: #b91c1c; }
.bc-lasterror { color: #d97706; }

.bc-overlay {
  position: fixed; inset: 0; background: rgba(24, 29, 38, 0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1300;
}
.bc-dialog {
  width: 560px; max-width: 94vw; max-height: 90vh; overflow-y: auto;
  background: var(--surface, #fff); border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,.25);
  display: flex; flex-direction: column;
}
.bc-dialog-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; border-bottom: 1px solid #e5e7eb; font-weight: 700; font-size: 15px;
}
.bc-x { border: none; background: none; cursor: pointer; color: #6b7280; padding: 4px; }
.bc-dialog-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
.bc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.bc-field { display: flex; flex-direction: column; gap: 5px; position: relative; }
.bc-label { font-size: 12px; font-weight: 600; color: #475569; }
.bc-help { font-size: 11px; color: #94a3b8; }
.bc-input {
  padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 13px;
  background: var(--surface, #fff); color: var(--ink, #141a24);
}
.bc-textarea { resize: vertical; font-family: inherit; }
.bc-suggestions {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 5; margin-top: 2px;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 12px 30px rgba(0,0,0,.15);
  max-height: 200px; overflow-y: auto;
}
.bc-suggestion-row { display: flex; justify-content: space-between; gap: 8px; padding: 8px 12px; cursor: pointer; font-size: 13px; }
.bc-suggestion-row:hover { background: #f8fafc; }
.bc-sub { color: #94a3b8; font-size: 12px; }
.bc-selected-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.bc-chip {
  display: inline-flex; align-items: center; gap: 4px; background: #eef2ff; color: #4338ca;
  padding: 3px 6px 3px 10px; border-radius: 999px; font-size: 12px;
}
.bc-chip button { border: none; background: none; cursor: pointer; color: inherit; display: flex; }
.bc-error { color: #b91c1c; font-size: 13px; }
.bc-dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 18px; border-top: 1px solid #e5e7eb; }

.bc-attach-row { display: flex; align-items: center; gap: 8px; }
.bc-upload-btn { cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.bc-attach-thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.bc-thumb { position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
.bc-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bc-thumb-x {
  position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: rgba(0,0,0,.6); color: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}

.bc-picker-overlay {
  position: fixed; inset: 0; background: rgba(24, 29, 38, 0.5);
  display: flex; align-items: center; justify-content: center; z-index: 1400;
}
.bc-picker {
  width: 640px; max-width: 94vw; max-height: 80vh; overflow: hidden;
  background: var(--surface, #fff); border-radius: 14px; box-shadow: 0 24px 60px rgba(0,0,0,.25);
  display: flex; flex-direction: column;
}
.bc-picker-body { padding: 16px 18px; overflow-y: auto; flex: 1; }
.bc-picker-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.bc-picker-item { position: relative; aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid transparent; }
.bc-picker-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bc-picker-item.selected { border-color: #4338ca; }
.bc-picker-check { position: absolute; top: 4px; right: 4px; color: #4338ca; background: #fff; border-radius: 50%; }

.bc-contact-picker { width: 480px; }
.bc-picker-search { padding: 12px 18px 0; }
.bc-contact-list { display: flex; flex-direction: column; gap: 2px; max-height: 50vh; }
.bc-contact-row {
  display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 8px;
  cursor: pointer; font-size: 13px;
}
.bc-contact-row:hover { background: #f8fafc; }
.bc-contact-row input[type="checkbox"] { width: 16px; height: 16px; flex-shrink: 0; }
.bc-contact-name { flex: 1; font-weight: 500; }
.bc-loadmore { align-self: center; margin-top: 8px; }
</style>
