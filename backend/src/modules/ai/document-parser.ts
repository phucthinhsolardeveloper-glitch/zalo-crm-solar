// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * Text extraction for AI knowledge base document uploads.
 * PDF and DOCX arrive as binary — extract plain text before chunking/embedding.
 * Everything else (txt/md/csv/json) is already plain text, decoded as utf8.
 */
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

const PDF_MIME_TYPES = new Set(['application/pdf']);
const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isPdf(mimeType: string, filename: string): boolean {
  return PDF_MIME_TYPES.has(mimeType) || /\.pdf$/i.test(filename);
}

export function isDocx(mimeType: string, filename: string): boolean {
  return DOCX_MIME_TYPES.has(mimeType) || /\.docx$/i.test(filename);
}

/** Extract plain text from an uploaded knowledge-doc file, by type. */
export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  if (isPdf(mimeType, filename)) {
    const parsed = await pdfParse(buffer);
    return parsed.text;
  }
  if (isDocx(mimeType, filename)) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString('utf8');
}
