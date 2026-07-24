// SPDX-License-Identifier: AGPL-3.0-or-later
export type ChatbotScheduleConfig = {
  zaloChatbotWeekdayEnabled: boolean;
  zaloChatbotWeekdayStart: string;
  zaloChatbotWeekdayEnd: string;
  zaloChatbotWeekendEnabled: boolean;
  zaloChatbotWeekendStart: string;
  zaloChatbotWeekendEnd: string;
};

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function offsetMinutes(timezone: string): number {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);
  if (!match) return 7 * 60;
  const value = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -value : value;
}

export function isChatbotScheduleActive(config: ChatbotScheduleConfig, now: Date, timezone = '+07:00'): boolean {
  const local = new Date(now.getTime() + offsetMinutes(timezone) * 60_000);
  const day = local.getUTCDay();
  const weekend = day === 0 || day === 6;
  const enabled = weekend ? config.zaloChatbotWeekendEnabled : config.zaloChatbotWeekdayEnabled;
  if (!enabled) return false;
  const start = parseTime(weekend ? config.zaloChatbotWeekendStart : config.zaloChatbotWeekdayStart);
  const end = parseTime(weekend ? config.zaloChatbotWeekendEnd : config.zaloChatbotWeekdayEnd);
  if (start === null || end === null) return false;
  const current = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

export function startOfLocalDayUtc(now: Date, timezone = '+07:00'): Date {
  const offset = offsetMinutes(timezone);
  const shifted = new Date(now.getTime() + offset * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - offset * 60_000);
}

export function isGenericSupportRequest(raw: string): boolean {
  const text = raw
    .trim()
    .toLocaleLowerCase('vi-VN')
    .replace(/[.!?,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return false;

  return [
    /^(xin )?(chào|hello|hi|alo)( (shop|ad|admin|bạn|anh|chị|em))?( ơi)?( ạ)?$/,
    /^(shop|ad|admin|bạn|anh|chị|em) ơi( ạ)?$/,
    /^((tôi|mình|em|anh|chị) )?(đang )?(cần|muốn|xin) (được )?(tư vấn|hỗ trợ|giúp đỡ)( thêm)?( ạ)?$/,
    /^(có ai|ai có thể) (tư vấn|hỗ trợ|giúp)( (cho )?(tôi|mình|em))?( không)?( ạ)?$/,
    /^(tư vấn|hỗ trợ|giúp) (cho |giúp )?(tôi|mình|em)( với| nhé| được không)?( ạ)?$/,
  ].some((pattern) => pattern.test(text));
}

export function chunkKnowledgeText(raw: string, maxChars = 1_200, overlap = 180): string[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const flush = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = '';
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      const step = Math.max(1, maxChars - overlap);
      for (let start = 0; start < paragraph.length; start += step) {
        chunks.push(paragraph.slice(start, start + maxChars).trim());
        if (start + maxChars >= paragraph.length) break;
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars) flush();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();
  return chunks;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return -1;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return -1;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
