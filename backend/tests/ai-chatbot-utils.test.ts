import { describe, expect, it } from 'vitest';
import {
  chunkKnowledgeText,
  cosineSimilarity,
  isChatbotScheduleActive,
  isGenericSupportRequest,
  startOfLocalDayUtc,
  type ChatbotScheduleConfig,
} from '../src/modules/ai/ai-chatbot-utils.js';

const schedule: ChatbotScheduleConfig = {
  zaloChatbotWeekdayEnabled: true,
  zaloChatbotWeekdayStart: '18:00',
  zaloChatbotWeekdayEnd: '08:00',
  zaloChatbotWeekendEnabled: true,
  zaloChatbotWeekendStart: '09:00',
  zaloChatbotWeekendEnd: '17:00',
};

describe('isChatbotScheduleActive', () => {
  it('supports a weekday window crossing midnight', () => {
    expect(isChatbotScheduleActive(schedule, new Date('2026-07-23T12:00:00Z'), '+07:00')).toBe(true);
    expect(isChatbotScheduleActive(schedule, new Date('2026-07-23T03:00:00Z'), '+07:00')).toBe(false);
  });

  it('uses the weekend schedule on Saturday and Sunday', () => {
    expect(isChatbotScheduleActive(schedule, new Date('2026-07-25T03:00:00Z'), '+07:00')).toBe(true);
    expect(isChatbotScheduleActive(schedule, new Date('2026-07-25T12:00:00Z'), '+07:00')).toBe(false);
  });

  it('treats equal start and end as a full day', () => {
    const allDay = { ...schedule, zaloChatbotWeekendStart: '00:00', zaloChatbotWeekendEnd: '00:00' };
    expect(isChatbotScheduleActive(allDay, new Date('2026-07-25T12:00:00Z'), '+07:00')).toBe(true);
  });
});

describe('startOfLocalDayUtc', () => {
  it('resets quota at midnight in the organization timezone', () => {
    expect(startOfLocalDayUtc(new Date('2026-07-23T01:00:00Z'), '+07:00').toISOString())
      .toBe('2026-07-22T17:00:00.000Z');
  });
});

describe('isGenericSupportRequest', () => {
  it.each([
    'Xin chào',
    'Shop ơi',
    'Tôi cần tư vấn',
    'Có ai hỗ trợ mình không ạ?',
    'Tư vấn giúp tôi với',
  ])('accepts a general support intent: %s', (message) => {
    expect(isGenericSupportRequest(message)).toBe(true);
  });

  it.each([
    'Công ty có bán xe máy điện không?',
    'Phí giao hàng là bao nhiêu?',
    'bề chưa',
  ])('does not mask a specific or unclear question: %s', (message) => {
    expect(isGenericSupportRequest(message)).toBe(false);
  });
});

describe('chunkKnowledgeText', () => {
  it('normalizes whitespace and keeps paragraphs together up to the limit', () => {
    expect(chunkKnowledgeText('  Một   hai\n\nBa  ', 20, 4)).toEqual(['Một hai\n\nBa']);
  });

  it('overlaps long chunks', () => {
    const chunks = chunkKnowledgeText('abcdefghijklmnopqrst', 10, 2);
    expect(chunks).toEqual(['abcdefghij', 'ijklmnopqr', 'qrst']);
  });
});

describe('cosineSimilarity', () => {
  it('scores identical and orthogonal vectors', () => {
    expect(cosineSimilarity([1, 2], [1, 2])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('rejects incompatible vectors', () => {
    expect(cosineSimilarity([], [])).toBe(-1);
    expect(cosineSimilarity([1], [1, 2])).toBe(-1);
  });
});
