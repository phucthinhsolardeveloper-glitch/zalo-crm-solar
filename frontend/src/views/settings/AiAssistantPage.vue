<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2026 Nguyễn Tiến Lộc -->
<template>
  <div class="ai-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">OPENAI</p>
        <h1>Trợ lý AI</h1>
        <p class="subtitle">Quản lý chatbot Zalo và trợ lý chat nội bộ.</p>
      </div>
      <div v-if="loading" class="loading"><LoaderCircle :size="16" class="spin" /> Đang tải</div>
    </header>

    <nav class="tabs" aria-label="Chế độ AI">
      <button :class="{ active: activeTab === 'chatbot' }" @click="activeTab = 'chatbot'">
        <MessageSquareText :size="18" /> Chatbot Zalo
      </button>
      <button :class="{ active: activeTab === 'assistant' }" @click="activeTab = 'assistant'">
        <Bot :size="18" /> Trợ lý nội bộ
      </button>
    </nav>

    <main v-if="!loading && activeTab === 'chatbot' && chatbot" class="page-body">
      <section class="status-strip" :class="chatbot.enabled && chatbot.readyDocuments ? 'online' : 'offline'">
        <div class="status-main">
          <span class="status-dot" />
          <div>
            <strong>{{ chatbot.enabled && chatbot.readyDocuments ? 'Chatbot đang sẵn sàng' : 'Chatbot chưa hoạt động' }}</strong>
            <span>{{ chatbot.readyDocuments }} tài liệu đã lập chỉ mục</span>
          </div>
        </div>
        <label class="switch">
          <input v-model="chatbot.enabled" type="checkbox" :disabled="chatbot.readyDocuments === 0" />
          <span />
        </label>
      </section>

      <section class="settings-section">
        <div class="section-heading">
          <div><h2>Lịch hoạt động</h2><p>Theo múi giờ của tổ chức.</p></div>
          <Clock3 :size="20" />
        </div>
        <div class="schedule-grid">
          <div class="schedule-row">
            <label class="check-label"><input v-model="chatbot.weekdayEnabled" type="checkbox" /> Thứ 2 - Thứ 6</label>
            <div class="time-range">
              <input v-model="chatbot.weekdayStart" type="time" :disabled="!chatbot.weekdayEnabled" />
              <ArrowRight :size="16" />
              <input v-model="chatbot.weekdayEnd" type="time" :disabled="!chatbot.weekdayEnabled" />
            </div>
          </div>
          <div class="schedule-row">
            <label class="check-label"><input v-model="chatbot.weekendEnabled" type="checkbox" /> Thứ 7 - Chủ nhật</label>
            <div class="time-range">
              <input v-model="chatbot.weekendStart" type="time" :disabled="!chatbot.weekendEnabled" />
              <ArrowRight :size="16" />
              <input v-model="chatbot.weekendEnd" type="time" :disabled="!chatbot.weekendEnabled" />
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-heading">
          <div><h2>Mô hình và kiểm soát</h2><p>Chatbot luôn dùng API key OpenAI đã cấu hình.</p></div>
          <SlidersHorizontal :size="20" />
        </div>
        <div class="field-grid three">
          <label><span>Model trả lời</span><input v-model="chatbot.model" type="text" /></label>
          <label><span>Quota gửi mỗi ngày</span><input v-model.number="chatbot.maxDaily" type="number" min="1" max="10000" /></label>
          <label><span>Số đoạn tham chiếu</span><input v-model.number="chatbot.topK" type="number" min="1" max="10" /></label>
        </div>
        <label class="range-field">
          <span>Ngưỡng tương đồng <strong>{{ chatbot.similarityThreshold.toFixed(2) }}</strong></span>
          <input v-model.number="chatbot.similarityThreshold" type="range" min="0.4" max="0.95" step="0.01" />
        </label>
        <label class="full-field">
          <span>Prompt trả lời</span>
          <textarea v-model="chatbot.promptTemplate" rows="7" spellcheck="false" />
        </label>
      </section>

      <section class="settings-section knowledge-section">
        <div class="section-heading">
          <div><h2>Kho tài liệu</h2><p>TXT, Markdown, CSV hoặc JSON, tối đa 1 MB mỗi file.</p></div>
          <div class="heading-actions">
            <input ref="fileInput" class="hidden-input" type="file" accept=".txt,.md,.markdown,.csv,.json" @change="uploadFile" />
            <button class="icon-button" title="Tải tài liệu lên" :disabled="uploading" @click="fileInput?.click()">
              <Upload :size="18" />
            </button>
            <button class="secondary-button" @click="showPaste = !showPaste"><Plus :size="17" /> Thêm nội dung</button>
          </div>
        </div>

        <form v-if="showPaste" class="paste-form" @submit.prevent="addPastedDocument">
          <input v-model="newDocument.name" placeholder="Tên tài liệu" maxlength="180" required />
          <textarea v-model="newDocument.content" rows="8" placeholder="Dán nội dung kiến thức tại đây" required />
          <div class="form-actions">
            <button type="button" class="text-button" @click="showPaste = false">Huỷ</button>
            <button type="submit" class="primary-button" :disabled="uploading"><DatabaseZap :size="17" /> Lập chỉ mục</button>
          </div>
        </form>

        <div v-if="documents.length" class="document-list">
          <div v-for="doc in documents" :key="doc.id" class="document-row">
            <div class="file-icon"><FileText :size="19" /></div>
            <div class="document-info">
              <strong>{{ doc.name }}</strong>
              <span>{{ formatBytes(doc.sizeBytes) }} · {{ doc.chunkCount }} đoạn · {{ formatDate(doc.createdAt) }}</span>
              <small v-if="doc.error">{{ doc.error }}</small>
            </div>
            <span class="status-badge" :class="doc.status">{{ statusLabel(doc.status) }}</span>
            <button class="icon-button danger" title="Xoá tài liệu" @click="removeDocument(doc)"><Trash2 :size="17" /></button>
          </div>
        </div>
        <div v-else class="empty-state"><BookOpen :size="30" /><strong>Chưa có tài liệu</strong><span>Thêm kiến thức trước khi bật chatbot.</span></div>
      </section>

      <section class="settings-section logs-section">
        <div class="section-heading">
          <div><h2>Lịch sử tự trả lời</h2><p>50 hoạt động gần nhất.</p></div>
          <button class="icon-button" title="Tải lại lịch sử" @click="loadLogs"><RefreshCw :size="17" /></button>
        </div>
        <div v-if="logs.length" class="log-list">
          <article v-for="log in logs" :key="log.id" class="log-row">
            <span class="log-status" :class="log.status"><Check v-if="log.status === 'sent'" :size="15" /><TriangleAlert v-else :size="15" /></span>
            <div><strong>{{ log.question || log.reason }}</strong><p v-if="log.answer">{{ log.answer }}</p><small>{{ formatDate(log.createdAt) }}<template v-if="log.similarity"> · Độ khớp {{ Math.round(log.similarity * 100) }}%</template></small></div>
          </article>
        </div>
        <div v-else class="empty-inline">Chưa có lượt tự trả lời.</div>
      </section>

      <footer class="sticky-actions">
        <span :class="saveOk ? 'success' : 'error'">{{ saveMessage }}</span>
        <button class="primary-button" :disabled="saving" @click="saveChatbot"><Save :size="17" /> {{ saving ? 'Đang lưu' : 'Lưu cấu hình' }}</button>
      </footer>
    </main>

    <main v-if="!loading && activeTab === 'assistant' && assistant" class="page-body">
      <section class="status-strip" :class="assistant.aiAssistantEnabled ? 'online' : 'offline'">
        <div class="status-main"><span class="status-dot" /><div><strong>Trợ lý chat nội bộ</strong><span>{{ assistant.provider }} · {{ assistant.model }}</span></div></div>
        <label class="switch"><input v-model="assistant.aiAssistantEnabled" type="checkbox" /><span /></label>
      </section>
      <section class="settings-section">
        <div class="section-heading"><div><h2>Prompt và bộ lọc</h2><p>Áp dụng cho virtual chat nội bộ.</p></div><Bot :size="20" /></div>
        <label class="full-field"><span>Prompt mẫu</span><textarea v-model="assistant.aiAssistantPromptTemplate" rows="14" spellcheck="false" /></label>
        <label class="full-field"><span>Regex bỏ qua tin nhiễu</span><input v-model="assistant.aiAssistantSkipNoisePattern" spellcheck="false" /></label>
      </section>
      <footer class="sticky-actions">
        <span :class="saveOk ? 'success' : 'error'">{{ saveMessage }}</span>
        <button class="text-button" @click="assistant.aiAssistantPromptTemplate = assistant.defaultPrompt"><RotateCcw :size="17" /> Mặc định</button>
        <button class="primary-button" :disabled="saving" @click="saveAssistant"><Save :size="17" /> {{ saving ? 'Đang lưu' : 'Lưu cấu hình' }}</button>
      </footer>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '@/api/index';
import {
  ArrowRight, BookOpen, Bot, Check, Clock3, DatabaseZap, FileText, LoaderCircle,
  MessageSquareText, Plus, RefreshCw, RotateCcw, Save, SlidersHorizontal,
  Trash2, TriangleAlert, Upload,
} from 'lucide-vue-next';

type ChatbotConfig = {
  enabled: boolean; model: string; promptTemplate: string; defaultPrompt: string;
  weekdayEnabled: boolean; weekdayStart: string; weekdayEnd: string;
  weekendEnabled: boolean; weekendStart: string; weekendEnd: string;
  maxDaily: number; similarityThreshold: number; topK: number;
  embeddingModel: string; readyDocuments: number;
};
type AssistantConfig = {
  aiAssistantEnabled: boolean; aiAssistantPromptTemplate: string;
  aiAssistantSkipNoisePattern: string; defaultPrompt: string; provider: string; model: string;
};
type KnowledgeDocument = {
  id: string; name: string; mimeType: string; sizeBytes: number; status: string;
  error: string | null; chunkCount: number; createdAt: string;
};
type ChatbotLog = {
  id: string; status: string; question: string | null; answer: string | null;
  reason: string | null; similarity: number | null; createdAt: string;
};

const activeTab = ref<'chatbot' | 'assistant'>('chatbot');
const loading = ref(true);
const saving = ref(false);
const uploading = ref(false);
const chatbot = ref<ChatbotConfig | null>(null);
const assistant = ref<AssistantConfig | null>(null);
const documents = ref<KnowledgeDocument[]>([]);
const logs = ref<ChatbotLog[]>([]);
const saveMessage = ref('');
const saveOk = ref(false);
const showPaste = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const newDocument = ref({ name: '', content: '' });

function notify(message: string, ok: boolean) {
  saveMessage.value = message;
  saveOk.value = ok;
  window.setTimeout(() => { if (saveMessage.value === message) saveMessage.value = ''; }, 3500);
}

async function load() {
  loading.value = true;
  try {
    const [chatbotRes, assistantRes, docsRes, logsRes] = await Promise.all([
      api.get<ChatbotConfig>('/ai/chatbot/config'),
      api.get<AssistantConfig>('/ai/assistant-config'),
      api.get<KnowledgeDocument[]>('/ai/chatbot/documents'),
      api.get<ChatbotLog[]>('/ai/chatbot/logs?limit=50'),
    ]);
    chatbot.value = chatbotRes.data;
    assistant.value = assistantRes.data;
    documents.value = docsRes.data;
    logs.value = logsRes.data;
  } catch (error: any) {
    notify(error?.response?.data?.error || 'Không tải được cấu hình AI', false);
  } finally { loading.value = false; }
}

async function saveChatbot() {
  if (!chatbot.value) return;
  saving.value = true;
  try { await api.put('/ai/chatbot/config', chatbot.value); notify('Đã lưu cấu hình chatbot', true); }
  catch (error: any) { notify(error?.response?.data?.error || 'Không lưu được cấu hình', false); }
  finally { saving.value = false; }
}

async function saveAssistant() {
  if (!assistant.value) return;
  try { new RegExp(assistant.value.aiAssistantSkipNoisePattern); }
  catch { notify('Regex bỏ qua tin nhiễu không hợp lệ', false); return; }
  saving.value = true;
  try {
    await api.put('/ai/assistant-config', assistant.value);
    notify('Đã lưu cấu hình trợ lý nội bộ', true);
  } catch (error: any) { notify(error?.response?.data?.error || 'Không lưu được cấu hình', false); }
  finally { saving.value = false; }
}

async function refreshDocuments() {
  const { data } = await api.get<KnowledgeDocument[]>('/ai/chatbot/documents');
  documents.value = data;
  if (chatbot.value) chatbot.value.readyDocuments = data.filter((doc) => doc.status === 'ready').length;
}

async function addPastedDocument() {
  uploading.value = true;
  try {
    await api.post('/ai/chatbot/documents', newDocument.value);
    newDocument.value = { name: '', content: '' };
    showPaste.value = false;
    await refreshDocuments();
    notify('Đã lập chỉ mục tài liệu', true);
  } catch (error: any) { notify(error?.response?.data?.error || 'Không thêm được tài liệu', false); }
  finally { uploading.value = false; }
}

async function uploadFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  uploading.value = true;
  const form = new FormData();
  form.append('file', file);
  try {
    await api.post('/ai/chatbot/documents/upload', form);
    await refreshDocuments();
    notify('Đã lập chỉ mục tài liệu', true);
  } catch (error: any) { notify(error?.response?.data?.error || 'Không tải được tài liệu', false); }
  finally { uploading.value = false; input.value = ''; }
}

async function removeDocument(doc: KnowledgeDocument) {
  if (!window.confirm(`Xoá tài liệu “${doc.name}”?`)) return;
  try { await api.delete(`/ai/chatbot/documents/${doc.id}`); await refreshDocuments(); notify('Đã xoá tài liệu', true); }
  catch (error: any) { notify(error?.response?.data?.error || 'Không xoá được tài liệu', false); }
}

async function loadLogs() {
  const { data } = await api.get<ChatbotLog[]>('/ai/chatbot/logs?limit=50');
  logs.value = data;
}

const statusLabel = (status: string) => status === 'ready' ? 'Sẵn sàng' : status === 'failed' ? 'Lỗi' : 'Đang xử lý';
const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

onMounted(load);
</script>

<style scoped>
.ai-page { max-width: 1080px; margin: 0 auto; padding: 8px 8px 72px; color: #17231d; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 18px 0 22px; }
.eyebrow { margin: 0 0 5px; color: #147a4b; font-size: 11px; font-weight: 800; letter-spacing: 0; }
h1 { margin: 0; font-size: 30px; line-height: 1.2; letter-spacing: 0; }
.subtitle { margin: 7px 0 0; color: #647169; font-size: 14px; }
.loading { display: flex; align-items: center; gap: 7px; color: #66736b; font-size: 13px; }
.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid #dce4df; }
.tabs button { display: flex; align-items: center; gap: 8px; border: 0; border-bottom: 2px solid transparent; background: transparent; padding: 11px 16px; color: #6a766f; font: inherit; font-weight: 650; cursor: pointer; }
.tabs button.active { border-color: #168456; color: #126c47; }
.page-body { display: grid; gap: 18px; padding-top: 20px; }
.status-strip { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border: 1px solid #dbe3de; border-radius: 7px; background: #f7f9f8; }
.status-strip.online { border-color: #b7ddca; background: #f1faf5; }
.status-main { display: flex; align-items: center; gap: 12px; }
.status-main div { display: grid; gap: 3px; }
.status-main strong { font-size: 14px; }.status-main span { color: #6b766f; font-size: 12px; }
.status-dot { width: 9px; height: 9px; border-radius: 50%; background: #9ba69f; }.online .status-dot { background: #1b9b62; box-shadow: 0 0 0 4px #dcefe5; }
.switch input { position: absolute; opacity: 0; }.switch span { display: block; width: 42px; height: 24px; border-radius: 12px; background: #b9c2bc; cursor: pointer; position: relative; transition: .2s; }
.switch span::after { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; border-radius: 50%; background: white; transition: .2s; }.switch input:checked + span { background: #168456; }.switch input:checked + span::after { transform: translateX(18px); }.switch input:disabled + span { opacity: .45; cursor: not-allowed; }
.settings-section { border-top: 1px solid #e0e6e2; padding: 22px 2px 4px; }
.section-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 17px; color: #627067; }.section-heading h2 { margin: 0; color: #1d2a23; font-size: 17px; letter-spacing: 0; }.section-heading p { margin: 4px 0 0; font-size: 12px; }
.schedule-grid { display: grid; gap: 10px; }.schedule-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 12px 14px; background: #f7f9f8; border: 1px solid #e2e8e4; border-radius: 6px; }.check-label { display: flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 650; }.check-label input { accent-color: #168456; width: 16px; height: 16px; }.time-range { display: flex; align-items: center; gap: 10px; color: #8a958e; }
input, textarea { border: 1px solid #cfd8d2; border-radius: 5px; background: #fff; color: #17231d; font: inherit; font-size: 14px; outline: none; }.time-range input { padding: 7px 9px; }.time-range input:disabled { opacity: .45; }.field-grid { display: grid; gap: 14px; }.field-grid.three { grid-template-columns: 1.4fr 1fr 1fr; }.field-grid label, .full-field, .range-field { display: grid; gap: 7px; }.field-grid label span, .full-field > span, .range-field > span { color: #56645c; font-size: 12px; font-weight: 700; }.field-grid input, .full-field input { height: 40px; padding: 0 11px; }.full-field { margin-top: 16px; }.full-field textarea, .paste-form textarea { padding: 11px; resize: vertical; line-height: 1.55; }.range-field { margin-top: 18px; }.range-field input { accent-color: #168456; }
.heading-actions, .form-actions { display: flex; align-items: center; gap: 8px; }.hidden-input { display: none; }.icon-button, .secondary-button, .primary-button, .text-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; border-radius: 5px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }.icon-button { width: 36px; border: 1px solid #d2dbd5; background: #fff; color: #526159; }.secondary-button { border: 1px solid #c9d5ce; background: #fff; color: #24332b; padding: 0 12px; }.primary-button { border: 1px solid #127247; background: #168456; color: white; padding: 0 14px; }.text-button { border: 0; background: transparent; color: #54625a; padding: 0 10px; }.icon-button:disabled, .primary-button:disabled { opacity: .5; cursor: not-allowed; }.icon-button.danger { color: #a73b3b; }
.paste-form { display: grid; gap: 10px; padding: 14px; margin-bottom: 12px; background: #f6f9f7; border: 1px solid #dce5df; border-radius: 6px; }.paste-form input { height: 40px; padding: 0 11px; }.form-actions { justify-content: flex-end; }
.document-list { border-top: 1px solid #e5eae7; }.document-row { display: grid; grid-template-columns: 38px minmax(0,1fr) auto 36px; align-items: center; gap: 12px; padding: 12px 4px; border-bottom: 1px solid #e5eae7; }.file-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 5px; background: #edf5f0; color: #17794d; }.document-info { display: grid; min-width: 0; gap: 3px; }.document-info strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.document-info span, .document-info small { color: #718078; font-size: 11px; }.document-info small { color: #a33d3d; }.status-badge { padding: 4px 7px; border-radius: 4px; background: #edf1ee; color: #5f6b64; font-size: 11px; font-weight: 700; }.status-badge.ready { background: #e5f5ec; color: #17764b; }.status-badge.failed { background: #fbeaea; color: #a33d3d; }
.empty-state { display: grid; place-items: center; gap: 7px; padding: 34px; color: #7a877f; border: 1px dashed #ccd6d0; border-radius: 6px; }.empty-state strong { color: #45534b; font-size: 13px; }.empty-state span, .empty-inline { color: #7a877f; font-size: 12px; }.log-list { display: grid; }.log-row { display: grid; grid-template-columns: 28px 1fr; gap: 10px; padding: 12px 3px; border-bottom: 1px solid #e5eae7; }.log-status { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #e3f3ea; color: #17764b; }.log-status.error { background: #fbe7e7; color: #a33d3d; }.log-row strong { display: block; font-size: 13px; }.log-row p { margin: 4px 0; color: #45534b; font-size: 13px; line-height: 1.45; }.log-row small { color: #849088; font-size: 11px; }.empty-inline { padding: 18px 0; }
.sticky-actions { position: sticky; bottom: 0; display: flex; align-items: center; justify-content: flex-end; gap: 10px; min-height: 58px; padding: 10px 2px; border-top: 1px solid #dce4df; background: rgba(255,255,255,.96); }.sticky-actions span { margin-right: auto; font-size: 12px; }.success { color: #17764b; }.error { color: #a33d3d; }
@media (max-width: 720px) { .ai-page { padding-inline: 0; }.page-header { padding-inline: 4px; }.field-grid.three { grid-template-columns: 1fr; }.schedule-row { align-items: flex-start; flex-direction: column; }.time-range { width: 100%; }.time-range input { flex: 1; min-width: 0; }.section-heading { align-items: center; }.knowledge-section .section-heading { align-items: flex-start; flex-direction: column; }.heading-actions { width: 100%; }.secondary-button { flex: 1; }.document-row { grid-template-columns: 38px minmax(0,1fr) 36px; }.status-badge { grid-column: 2; justify-self: start; }.document-row .danger { grid-column: 3; grid-row: 1; }.tabs button { flex: 1; }.subtitle { max-width: 260px; } }
</style>
