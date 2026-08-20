// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * use-spreadsheet-parser.ts — đọc worksheet đầu tiên của xlsx/xls/csv thành mảng
 * 2 chiều (1 row/entry).
 *   - .csv: parser tự viết (parseCsvText, state-machine RFC4180-ish) — KHÔNG cần exceljs.
 *   - .xlsx/.xls: exceljs (đã audit bảo mật, thay `xlsx` — GHSA-4r6h-8v6p-xvw6, prototype
 *     pollution + ReDoS chưa vá), lazy-import để không tải ~930KB cho user chỉ import CSV.
 */

/**
 * FIX 2026-08-20: parser CSV cũ chỉ `line.split(',')` thô — vỡ với:
 *   - Cell có dấu phẩy bên trong, quote đúng chuẩn: `"Nguyễn Văn A, Q.1"`
 *   - Quote escape kiểu RFC4180: `"Nói ""xin chào"""` → `Nói "xin chào"`
 *   - Xuống dòng trong 1 cell (quoted field chứa \n)
 * Viết lại bằng state-machine char-by-char (RFC4180-ish), KHÔNG thêm thư viện mới —
 * ~50 dòng, đủ cho input CSV thực tế (Excel/Google Sheets export).
 */
export function parseCsvText(text: string): string[][] {
  // Excel xuất CSV UTF-8 thường kèm BOM ở đầu file — bỏ đi tránh dính vào cell đầu tiên.
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = clean.length;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < len) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 2; continue; } // "" → "
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { pushField(); i++; continue; }
    if (ch === '\r') { i++; continue; } // bỏ \r, xử lý xuống dòng ở \n
    if (ch === '\n') { pushRow(); i++; continue; }
    field += ch; i++;
  }
  // Dòng cuối không có \n kết thúc — vẫn phải push nếu còn field/row dang dở.
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

export async function parseSheetToRows(buf: ArrayBuffer, filename: string): Promise<unknown[][]> {
  const lo = filename.toLowerCase();
  if (lo.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buf);
    return parseCsvText(text).map((row) => row.map((c) => c.trim()));
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    // row.values 1-indexed với null ở đầu; bỏ index 0.
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    out.push(values);
  });
  return out;
}
