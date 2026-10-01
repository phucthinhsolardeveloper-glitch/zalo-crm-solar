/**
 * block-content-resolver.test.ts — Community implementation của resolveBlockContent
 * (trước đây luôn {ok:false} trong Community — xem app.ts registerAutomationHooks).
 */
import { describe, it, expect } from 'vitest';
import { resolveBlockContentCommunity } from '../src/shared/block-content-resolver.js';

describe('resolveBlockContentCommunity', () => {
  it('resolve text đơn giản', () => {
    const result = resolveBlockContentCommunity('send_message', { text: 'Xin chào' });
    expect(result.ok).toBe(true);
    expect(result.resolved).toEqual([{ messageType: 'text', payload: { text: 'Xin chào', styles: null } }]);
  });

  it('resolve text kèm styles', () => {
    const styles = [{ st: 'b', start: 0, len: 4 }];
    const result = resolveBlockContentCommunity('send_message', { text: 'Chào bạn', styles });
    expect(result.ok).toBe(true);
    expect(result.resolved[0]).toMatchObject({ messageType: 'text', payload: { text: 'Chào bạn', styles } });
  });

  it('resolve nhiều ảnh KHÔNG gộp album khi albumImages không bật', () => {
    const result = resolveBlockContentCommunity('send_message', {
      attachments: [
        { kind: 'image', url: 'https://x/a.jpg' },
        { kind: 'image', url: 'https://x/b.jpg' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.resolved).toHaveLength(2);
    expect(result.resolved.every((m) => m.messageType === 'image')).toBe(true);
  });

  it('resolve nhiều ảnh GỘP thành album khi albumImages=true', () => {
    const result = resolveBlockContentCommunity('send_message', {
      albumImages: true,
      attachments: [
        { kind: 'image', url: 'https://x/a.jpg' },
        { kind: 'image', url: 'https://x/b.jpg' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.resolved).toEqual([
      { messageType: 'album', payload: { items: [{ url: 'https://x/a.jpg', caption: undefined, mediaAssetId: undefined }, { url: 'https://x/b.jpg', caption: undefined, mediaAssetId: undefined }] } },
    ]);
  });

  it('resolve video và file', () => {
    const result = resolveBlockContentCommunity('send_message', {
      attachments: [
        { kind: 'video', url: 'https://x/v.mp4', durationSec: 10 },
        { kind: 'file', url: 'https://x/f.pdf', filename: 'tai-lieu.pdf' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.resolved.map((m) => m.messageType)).toEqual(['video', 'file']);
  });

  it('content rỗng → ok:false BLOCK_EMPTY', () => {
    const result = resolveBlockContentCommunity('send_message', {});
    expect(result.ok).toBe(false);
    expect(result.error).toBe('BLOCK_EMPTY');
    expect(result.resolved).toEqual([]);
  });

  it('actionType khác send_message → ok:false UNSUPPORTED_ACTION_TYPE', () => {
    const result = resolveBlockContentCommunity('request_friend', { greeting: 'hi' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_ACTION_TYPE');
  });
});
