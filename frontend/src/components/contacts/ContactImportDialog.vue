<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!--
  ContactImportDialog.vue — import khách hàng từ xlsx/xls/csv.
  Pipeline: Upload → Column Mapping → Preview (validate + dedup) → Import → Result.
  Tái dùng use-spreadsheet-parser.ts (đã audit bảo mật, dùng chung với CreateListModal.vue)
  và phone-normalize/dedup logic đã có ở backend (contact-import-service.ts, cùng pattern
  quick-create). KHÔNG bao giờ insert mù — mọi dòng phải qua validate + dedup trước khi ghi.
-->
<template>
  <v-dialog v-model="show" max-width="880" persistent scrollable>
    <v-card>
      <v-card-title class="cid-title">
        <span>Import khách hàng từ Excel/CSV</span>
        <button class="cid-close" :disabled="importing" @click="close">✕</button>
      </v-card-title>

      <v-card-text class="cid-body">
        <!-- ── STEP 1: Upload ─────────────────────────────────────────── -->
        <div v-if="step === 'upload'" class="cid-upload">
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls,.csv" class="cid-file-input" @change="onFileChosen" />
          <button class="cid-upload-btn" @click="fileInputRef?.click()">
            <v-icon icon="mdi-file-upload-outline" size="32" />
            <strong>Chọn file .xlsx / .xls / .csv</strong>
            <span>Dòng đầu tiên được coi là tiêu đề cột</span>
          </button>
          <button class="btn-secondary" type="button" @click="downloadCsvTemplate">
            <v-icon icon="mdi-file-download-outline" size="18" />
            Tải file CSV mẫu
          </button>
          <div v-if="uploadError" class="cid-alert error">{{ uploadError }}</div>
        </div>

        <!-- ── STEP 2: Column Mapping ─────────────────────────────────── -->
        <div v-else-if="step === 'mapping'" class="cid-mapping">
          <p class="cid-hint">Chọn cột nào trong file khớp với trường nào trong CRM. "Họ tên" và "SĐT" là bắt buộc.</p>
          <div class="cid-map-grid">
            <div v-for="col in sourceColumns" :key="col.index" class="cid-map-row">
              <div class="cid-map-source">
                <strong>{{ col.header || `Cột ${col.index + 1}` }}</strong>
                <small>{{ col.sample }}</small>
              </div>
              <v-icon icon="mdi-arrow-right" size="16" />
              <select v-model="columnMapping[col.index]" class="cid-map-select">
                <option value="">— Bỏ qua —</option>
                <option v-for="f in TARGET_FIELDS" :key="f.key" :value="f.key">{{ f.label }}</option>
              </select>
            </div>
          </div>
          <div v-if="mappingError" class="cid-alert error">{{ mappingError }}</div>
        </div>

        <!-- ── STEP 3: Preview ────────────────────────────────────────── -->
        <div v-else-if="step === 'preview'" class="cid-preview">
          <div v-if="previewLoading" class="cid-state"><v-progress-circular indeterminate size="24" width="2" /> Đang kiểm tra dữ liệu…</div>
          <template v-else-if="previewResult">
            <div class="cid-summary">
              <span class="cid-chip valid">✅ {{ previewResult.valid }} hợp lệ</span>
              <span class="cid-chip dup">⚠️ {{ previewResult.duplicate }} trùng SĐT (sẽ bỏ qua)</span>
              <span class="cid-chip invalid">❌ {{ previewResult.invalid }} lỗi (sẽ bỏ qua)</span>
              <span class="cid-chip total">Tổng {{ previewResult.total }} dòng</span>
            </div>
            <div class="cid-preview-table-wrap">
              <table class="cid-preview-table">
                <thead><tr><th>#</th><th>Họ tên</th><th>SĐT</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead>
                <tbody>
                  <tr v-for="row in previewResult.rows" :key="row.rowIndex" :class="`row-${row.status}`">
                    <td>{{ row.rowIndex }}</td>
                    <td>{{ row.fullName || '—' }}</td>
                    <td>{{ row.phone || '—' }}</td>
                    <td><span class="cid-status-badge" :class="row.status">{{ statusLabel(row.status) }}</span></td>
                    <td class="cid-detail-cell">
                      <template v-if="row.status === 'invalid'">{{ invalidReasonLabel(row.invalidReason) }}</template>
                      <template v-else-if="row.status === 'duplicate'">{{ row.duplicateContactName || 'Trùng SĐT' }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>

        <!-- ── STEP 4: Result ─────────────────────────────────────────── -->
        <div v-else-if="step === 'result'" class="cid-result">
          <div v-if="importing" class="cid-state"><v-progress-circular indeterminate size="24" width="2" /> Đang import…</div>
          <template v-else-if="commitResult">
            <div class="cid-result-icon">✅</div>
            <h3>Đã import xong</h3>
            <div class="cid-summary">
              <span class="cid-chip valid">Đã tạo {{ commitResult.imported }} khách hàng</span>
              <span class="cid-chip dup">Bỏ qua {{ commitResult.skipped }} (trùng/không hợp lệ)</span>
              <span v-if="commitResult.failed" class="cid-chip invalid">Lỗi {{ commitResult.failed }} dòng</span>
            </div>
            <div v-if="commitResult.errors.length" class="cid-error-list">
              <div v-for="e in commitResult.errors" :key="e.rowIndex" class="cid-error-row">
                Dòng {{ e.rowIndex }}: {{ e.error }}
              </div>
            </div>
          </template>
        </div>
      </v-card-text>

      <v-card-actions class="cid-actions">
        <button v-if="step === 'mapping'" class="btn-secondary" :disabled="importing" @click="step = 'upload'">← Quay lại</button>
        <button v-if="step === 'preview'" class="btn-secondary" :disabled="importing" @click="step = 'mapping'">← Sửa cột</button>
        <v-spacer />
        <button v-if="step === 'mapping'" class="btn-primary" @click="runPreview">Tiếp tục → Xem trước</button>
        <button v-if="step === 'preview'" class="btn-primary" :disabled="!previewResult?.valid" @click="runImport">
          Import {{ previewResult?.valid || 0 }} khách hàng
        </button>
        <button v-if="step === 'result'" class="btn-primary" @click="finish">Xong</button>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { api } from '@/api';
import { useToast } from '@/composables/use-toast';
import { parseSheetToRows } from '@/composables/use-spreadsheet-parser';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'imported'): void;
}>();

const toast = useToast();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

type Step = 'upload' | 'mapping' | 'preview' | 'result';
const step = ref<Step>('upload');
const fileInputRef = ref<HTMLInputElement | null>(null);
const uploadError = ref('');
const mappingError = ref('');
const importing = ref(false);
const previewLoading = ref(false);

const TARGET_FIELDS = [
  { key: 'fullName', label: 'Họ tên *' },
  { key: 'phone', label: 'SĐT *' },
  { key: 'email', label: 'Email' },
  { key: 'industry', label: 'Ngành hàng' },
  { key: 'storeName', label: 'Tên cửa hàng' },
  { key: 'customerType', label: 'Đối tượng' },
  { key: 'importanceLevel', label: 'Mức độ quan trọng' },
  { key: 'province', label: 'Tỉnh/Thành phố' },
  { key: 'district', label: 'Quận/Huyện' },
  { key: 'ward', label: 'Phường/Xã' },
  { key: 'addressLine', label: 'Địa chỉ chi tiết' },
  { key: 'birthDate', label: 'Ngày sinh' },
  { key: 'source', label: 'Nguồn' },
  { key: 'status', label: 'Trạng thái' },
] as const;
type TargetField = typeof TARGET_FIELDS[number]['key'];

// Đoán mapping theo tên cột (tiếng Việt + tiếng Anh phổ biến) — sale vẫn sửa tay được.
const HEADER_GUESSES: Array<{ field: TargetField; patterns: RegExp }> = [
  { field: 'fullName', patterns: /h[oọ]\s*t[eê]n|full\s*name|^t[eê]n$|khách\s*h[aà]ng/i },
  { field: 'phone', patterns: /s[dđ]t|s[oố]\s*[dđ]i[eệ]n\s*tho[aạ]i|phone|mobile/i },
  { field: 'email', patterns: /email|mail/i },
  { field: 'industry', patterns: /ng[aà]nh\s*(?:h[aà]ng|ngh[eề])|ngh[eề]\s*nghi[eệ]p|industry/i },
  { field: 'storeName', patterns: /t[eê]n\s*c[uử]a\s*h[aà]ng|store/i },
  { field: 'customerType', patterns: /[dđ][oố]i\s*t[uượ]ng|customer\s*type|lo[aạ]i\s*kh[aá]ch/i },
  { field: 'importanceLevel', patterns: /m[uứ]c\s*[dđ][oộ]\s*quan\s*tr[oọ]ng|importance|priority/i },
  { field: 'province', patterns: /t[iỉ]nh|th[aà]nh\s*ph[oố]|province/i },
  { field: 'district', patterns: /qu[aậ]n|huy[eệ]n|district/i },
  { field: 'ward', patterns: /ph[uườ]ng|x[aã]|ward/i },
  { field: 'addressLine', patterns: /[dđ][iị]a\s*ch[iỉ]|address/i },
  { field: 'birthDate', patterns: /ng[aà]y\s*sinh|sinh\s*nh[aậ]t|birth/i },
  { field: 'source', patterns: /ngu[oồ]n|source/i },
  { field: 'status', patterns: /tr[aạ]ng\s*th[aá]i|status/i },
];

/**
 * Mẫu dùng đúng label mà auto-mapping nhận biết và đúng enum mà backend import hỗ trợ.
 * Có BOM để Excel trên Windows mở tiếng Việt đúng encoding; địa chỉ chứa dấu phẩy được
 * quote nhằm kiểm chứng luôn đường CSV RFC4180.
 */
function downloadCsvTemplate() {
  const headers = TARGET_FIELDS.map((field) => field.label.replace(/ \*$/, ''));
  const sample = [
    'Nguyễn Văn An', '0901234567', 'an@example.com', 'Bất động sản',
    'Cửa hàng An Phát', 'Đại lý', 'Quan trọng', 'TP Hồ Chí Minh', 'Quận 1', 'Phường Bến Nghé',
    '12 Nguyễn Huệ, tầng 2', '1990-01-31', 'import', 'Mới',
  ];
  const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = `\uFEFF${headers.map(csvCell).join(',')}\r\n${sample.map(csvCell).join(',')}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'mau-import-khach-hang.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

interface SourceColumn { index: number; header: string; sample: string }
const sourceColumns = ref<SourceColumn[]>([]);
const columnMapping = ref<Record<number, string>>({});
let dataRows: unknown[][] = []; // rows SAU header (dùng khi build payload)

/**
 * exceljs trả cell date thành Date object (không phải string), cell rich-text/hyperlink
 * thành object {richText:[...]} hoặc {text, hyperlink} — String(cell) trực tiếp sẽ ra rác
 * ("Thu Jan 01 2026...", "[object Object]"). Chuẩn hoá về string sạch trước khi dùng.
 */
function cellToString(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) {
    // Dùng local date parts (không toISOString) — tránh lệch ngày khi giờ VN gần UTC midnight.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'object') {
    const obj = value as { richText?: Array<{ text?: string }>; text?: unknown };
    if (Array.isArray(obj.richText)) return obj.richText.map((t) => t?.text ?? '').join('');
    if ('text' in obj) return String(obj.text ?? '');
    return '';
  }
  return String(value);
}

function resetState() {
  step.value = 'upload';
  uploadError.value = '';
  mappingError.value = '';
  sourceColumns.value = [];
  columnMapping.value = {};
  dataRows = [];
  previewResult.value = null;
  commitResult.value = null;
  if (fileInputRef.value) fileInputRef.value.value = '';
}

async function onFileChosen(e: Event) {
  uploadError.value = '';
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const allRows = await parseSheetToRows(buf, file.name);
    if (!allRows.length) {
      uploadError.value = 'File rỗng hoặc không đọc được dữ liệu.';
      return;
    }
    const header = allRows[0].map((c) => cellToString(c).trim());
    dataRows = allRows.slice(1).filter((r) => r.some((c) => cellToString(c).trim()));
    if (!dataRows.length) {
      uploadError.value = 'Không có dòng dữ liệu nào sau tiêu đề.';
      return;
    }
    sourceColumns.value = header.map((h, index) => ({
      index,
      header: h,
      sample: cellToString(dataRows[0]?.[index]),
    }));
    // Auto-guess mapping theo header, mỗi target field chỉ gán cho 1 cột (cột khớp đầu tiên).
    const usedFields = new Set<string>();
    const mapping: Record<number, string> = {};
    for (const col of sourceColumns.value) {
      const guess = HEADER_GUESSES.find((g) => g.patterns.test(col.header) && !usedFields.has(g.field));
      if (guess) { mapping[col.index] = guess.field; usedFields.add(guess.field); }
    }
    columnMapping.value = mapping;
    step.value = 'mapping';
  } catch (err: any) {
    uploadError.value = err?.message || 'Không đọc được file. Kiểm tra định dạng .xlsx/.xls/.csv.';
  }
}

function buildMappedRows(): Array<Record<string, string | null>> {
  const indexByField: Partial<Record<TargetField, number>> = {};
  for (const [idxStr, field] of Object.entries(columnMapping.value)) {
    if (field) indexByField[field as TargetField] = Number(idxStr);
  }
  return dataRows.map((row) => {
    const out: Record<string, string | null> = {};
    for (const f of TARGET_FIELDS) {
      const idx = indexByField[f.key];
      out[f.key] = idx != null ? (cellToString(row[idx]).trim() || null) : null;
    }
    return out;
  });
}

interface PreviewRow {
  rowIndex: number;
  fullName: string | null;
  phone: string | null;
  status: 'valid' | 'invalid' | 'duplicate';
  invalidReason: string | null;
  duplicateContactId: string | null;
  duplicateContactName: string | null;
}
interface PreviewResult { total: number; valid: number; invalid: number; duplicate: number; rows: PreviewRow[] }
const previewResult = ref<PreviewResult | null>(null);

async function runPreview() {
  mappingError.value = '';
  const mappedList = Object.values(columnMapping.value).filter(Boolean);
  const mappedFields = new Set(mappedList);
  if (!mappedFields.has('fullName') || !mappedFields.has('phone')) {
    mappingError.value = 'Cần map ít nhất "Họ tên" và "SĐT" trước khi tiếp tục.';
    return;
  }
  // 2 cột cùng map 1 field → cột sau âm thầm đè cột trước khi build payload. Chặn sớm
  // thay vì để user thắc mắc sao thiếu dữ liệu ở bước Preview.
  if (mappedList.length !== mappedFields.size) {
    mappingError.value = 'Có 2 cột đang map cùng 1 trường — mỗi trường CRM chỉ nên khớp với 1 cột trong file.';
    return;
  }
  step.value = 'preview';
  previewLoading.value = true;
  try {
    const rows = buildMappedRows();
    const { data } = await api.post('/contacts/import/preview', { rows });
    previewResult.value = data;
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Không kiểm tra được dữ liệu import');
    step.value = 'mapping';
  } finally {
    previewLoading.value = false;
  }
}

interface CommitResult { imported: number; skipped: number; failed: number; errors: Array<{ rowIndex: number; error: string }> }
const commitResult = ref<CommitResult | null>(null);

async function runImport() {
  step.value = 'result';
  importing.value = true;
  try {
    const rows = buildMappedRows();
    const { data } = await api.post('/contacts/import/commit', { rows });
    commitResult.value = data;
    if (data.imported > 0) emit('imported');
  } catch (error: any) {
    toast.error(error?.response?.data?.error || 'Import thất bại');
    step.value = 'preview';
  } finally {
    importing.value = false;
  }
}

function statusLabel(status: string) {
  return ({ valid: 'Hợp lệ', invalid: 'Lỗi', duplicate: 'Trùng' } as Record<string, string>)[status] || status;
}
function invalidReasonLabel(reason: string | null) {
  return ({
    missing_full_name: 'Thiếu họ tên',
    missing_phone: 'Thiếu SĐT',
    invalid_phone: 'SĐT không hợp lệ',
  } as Record<string, string>)[reason || ''] || 'Không hợp lệ';
}

function close() {
  if (importing.value) return;
  show.value = false;
  resetState();
}
function finish() {
  show.value = false;
  resetState();
}
</script>

<style scoped>
.cid-title { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; font-size: 16px; font-weight: 700; }
.cid-close { border: 0; background: none; font-size: 16px; color: #6b787e; cursor: pointer; }
.cid-body { padding: 0 20px 12px; min-height: 260px; }
.cid-upload { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; gap: 14px; }
.cid-file-input { display: none; }
.cid-upload-btn { display: flex; flex-direction: column; align-items: center; gap: 8px; border: 2px dashed #cddbd8; border-radius: 14px; padding: 36px 48px; background: #fbfdfc; color: #147d70; cursor: pointer; }
.cid-upload-btn:hover { border-color: #147d70; background: #f1faf8; }
.cid-upload-btn span { color: #8b979c; font-size: 12px; font-weight: 400; }
.cid-hint { color: #6b787e; font-size: 13px; margin: 8px 0 14px; }
.cid-map-grid { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; }
.cid-map-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid #edf1f1; border-radius: 8px; }
.cid-map-source { flex: 1; min-width: 0; display: grid; gap: 1px; }
.cid-map-source strong { font-size: 13px; color: #253238; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cid-map-source small { font-size: 11px; color: #8b979c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cid-map-select { width: 220px; border: 1px solid #d9e1e1; border-radius: 8px; padding: 6px 8px; font-size: 13px; }
.cid-summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.cid-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 12px; font-size: 12px; font-weight: 700; }
.cid-chip.valid { background: #e6f5ec; color: #287b4c; }
.cid-chip.dup { background: #fff4d9; color: #9a6a18; }
.cid-chip.invalid { background: #fdeceb; color: #b34848; }
.cid-chip.total { background: #eef1f1; color: #536168; }
.cid-preview-table-wrap { max-height: 360px; overflow: auto; border: 1px solid #edf1f1; border-radius: 8px; }
.cid-preview-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.cid-preview-table th { position: sticky; top: 0; background: #f7f9f9; padding: 8px 10px; text-align: left; font-weight: 700; color: #69777d; }
.cid-preview-table td { padding: 7px 10px; border-top: 1px solid #f1f4f4; color: #3b474c; }
.cid-status-badge { display: inline-flex; border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 700; }
.cid-status-badge.valid { background: #e6f5ec; color: #287b4c; }
.cid-status-badge.invalid { background: #fdeceb; color: #b34848; }
.cid-status-badge.duplicate { background: #fff4d9; color: #9a6a18; }
.cid-detail-cell { color: #8b979c; }
.cid-state { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 50px 0; color: #6b787e; }
.cid-result { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 20px 0; }
.cid-result-icon { font-size: 40px; }
.cid-result h3 { margin: 8px 0 14px; }
.cid-error-list { width: 100%; max-height: 200px; overflow-y: auto; margin-top: 10px; text-align: left; }
.cid-error-row { padding: 6px 10px; border-bottom: 1px solid #f1f4f4; font-size: 12px; color: #b34848; }
.cid-alert { margin-top: 12px; padding: 10px 12px; border-radius: 8px; font-size: 13px; }
.cid-alert.error { background: #fdecea; color: #b71c1c; }
.cid-actions { padding: 12px 20px 18px; }
.btn-secondary { border: 1px solid #d9e1e1; border-radius: 9px; padding: 9px 16px; background: #fff; color: #536168; font-weight: 700; cursor: pointer; }
.btn-primary { border: 0; border-radius: 9px; padding: 9px 18px; background: #147d70; color: #fff; font-weight: 700; cursor: pointer; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
</style>
