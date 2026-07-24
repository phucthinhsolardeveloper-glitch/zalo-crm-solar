import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  callRecord: {
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
};

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const uploadBufferMock = vi.fn();
vi.mock('../src/shared/storage/minio-client.js', () => ({ uploadBuffer: uploadBufferMock }));

const {
  createManualCall,
  upsertCallRecordFromMessage,
  listCallsForContact,
  attachRecording,
  removeRecording,
  getCallRecordContactId,
} = await import('../src/modules/calls/call-service.ts');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createManualCall', () => {
  it('tạo CallRecord status=manual với input tối thiểu', async () => {
    prismaMock.callRecord.create.mockResolvedValue({ id: 'cr1', status: 'manual' });
    const result = await createManualCall({
      orgId: 'org1', contactId: 'c1', zaloAccountId: 'z1',
      callType: 'voice', direction: 'outbound',
    });
    expect(prismaMock.callRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orgId: 'org1', contactId: 'c1', zaloAccountId: 'z1',
        callType: 'voice', direction: 'outbound', status: 'manual',
      }),
    }));
    expect(result).toEqual({ id: 'cr1', status: 'manual' });
  });
});

describe('upsertCallRecordFromMessage', () => {
  it('gọi prisma.callRecord.upsert với where theo sourceMessageId (chống double-insert)', async () => {
    prismaMock.callRecord.upsert.mockResolvedValue({ id: 'cr2' });
    await upsertCallRecordFromMessage({
      orgId: 'org1', contactId: 'c1', zaloAccountId: 'z1', conversationId: 'conv1',
      sourceMessageId: 'msg1', occurredAt: new Date('2026-07-23T00:00:00Z'),
      details: { direction: 'inbound', callType: 'voice', isMissed: false, durationSec: 39 },
    });
    expect(prismaMock.callRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sourceMessageId: 'msg1' },
      create: expect.objectContaining({
        status: 'connected', direction: 'inbound', callType: 'voice', durationSec: 39,
      }),
    }));
  });

  it('isMissed=true → status=missed', async () => {
    prismaMock.callRecord.upsert.mockResolvedValue({ id: 'cr3' });
    await upsertCallRecordFromMessage({
      orgId: 'org1', contactId: 'c1', zaloAccountId: 'z1', conversationId: null,
      sourceMessageId: 'msg2', occurredAt: new Date(),
      details: { direction: 'inbound', callType: 'voice', isMissed: true, durationSec: 0 },
    });
    expect(prismaMock.callRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'missed' }),
    }));
  });
});

describe('listCallsForContact', () => {
  it('query theo orgId+contactId, sort occurredAt desc', async () => {
    prismaMock.callRecord.findMany.mockResolvedValue([{ id: 'cr1' }]);
    const result = await listCallsForContact('org1', 'c1');
    expect(prismaMock.callRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { orgId: 'org1', contactId: 'c1' },
      orderBy: { occurredAt: 'desc' },
    }));
    expect(result).toEqual([{ id: 'cr1' }]);
  });
});

describe('attachRecording', () => {
  it('upload qua storage rồi update 4 field recording*', async () => {
    uploadBufferMock.mockResolvedValue({
      key: 'media/abc.mp3', url: 'https://cdn/abc.mp3', size: 1234,
      mimeType: 'audio/mpeg', contentHash: 'abc', deduped: false,
    });
    prismaMock.callRecord.findFirst.mockResolvedValue({ id: 'cr1', orgId: 'org1' });
    prismaMock.callRecord.update.mockResolvedValue({ id: 'cr1', recordingUrl: 'https://cdn/abc.mp3' });

    const result = await attachRecording({
      orgId: 'org1', callId: 'cr1',
      buffer: Buffer.from('fake-audio'), mimeType: 'audio/mpeg', originalName: 'ghiam.mp3',
    });

    expect(uploadBufferMock).toHaveBeenCalledWith(expect.any(Buffer), 'audio/mpeg', 'ghiam.mp3');
    expect(prismaMock.callRecord.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: {
        recordingKey: 'media/abc.mp3',
        recordingUrl: 'https://cdn/abc.mp3',
        recordingMimeType: 'audio/mpeg',
        recordingSizeBytes: 1234,
      },
    });
    expect(result).toEqual({ id: 'cr1', recordingUrl: 'https://cdn/abc.mp3' });
  });

  it('callId không thuộc org → null, không upload', async () => {
    prismaMock.callRecord.findFirst.mockResolvedValue(null);
    const result = await attachRecording({
      orgId: 'org1', callId: 'cr-not-exist', buffer: Buffer.from('x'), mimeType: 'audio/mpeg',
    });
    expect(result).toBeNull();
    expect(uploadBufferMock).not.toHaveBeenCalled();
  });
});

describe('getCallRecordContactId', () => {
  it('query theo id+orgId, trả contactId nếu tồn tại', async () => {
    prismaMock.callRecord.findFirst.mockResolvedValue({ contactId: 'c1' });
    const result = await getCallRecordContactId('org1', 'cr1');
    expect(prismaMock.callRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'cr1', orgId: 'org1' },
      select: { contactId: true },
    });
    expect(result).toBe('c1');
  });

  it('callId không tồn tại/không thuộc org → null', async () => {
    prismaMock.callRecord.findFirst.mockResolvedValue(null);
    const result = await getCallRecordContactId('org1', 'cr-not-exist');
    expect(result).toBeNull();
  });
});

describe('removeRecording', () => {
  it('null hoá 4 field recording*', async () => {
    prismaMock.callRecord.findFirst.mockResolvedValue({ id: 'cr1', orgId: 'org1' });
    prismaMock.callRecord.update.mockResolvedValue({ id: 'cr1', recordingUrl: null });
    const result = await removeRecording('org1', 'cr1');
    expect(prismaMock.callRecord.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: {
        recordingKey: null, recordingUrl: null,
        recordingMimeType: null, recordingSizeBytes: null,
      },
    });
    expect(result).toEqual({ id: 'cr1', recordingUrl: null });
  });
});
