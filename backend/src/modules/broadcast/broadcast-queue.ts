// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
// ════════════════════════════════════════════════════════════════════════
// Mục C (🟢 Community, 2026-09-30) — Broadcast BullMQ queue + worker wiring.
// ════════════════════════════════════════════════════════════════════════
//
// Self-contained COMMUNITY queue — cùng convention với group-scan-queue.ts
// (KHÔNG dùng _ee/automation/queues). 1 broadcast xử lý NHIỀU job (mỗi job =
// 1 chunk ≤ BROADCAST_CHUNK_SIZE contact) thay vì 1 job chạy tới hết — sau mỗi
// tick, nếu broadcast vẫn 'running' thì tự enqueue tick kế tiếp có delay
// (TICK_DELAY_MS) → vừa tạo pacing giữa các đợt gửi, vừa tránh giữ job chạy
// liên tục lâu. Nếu tick trả 'paused'/'completed' thì KHÔNG enqueue tiếp —
// cần người bấm "Resume" (route riêng) để chạy lại.
import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../../shared/utils/logger.js';
import { processBroadcastTick } from './broadcast-worker.js';

export const BROADCAST_QUEUE = 'broadcast-send';

// Giãn cách giữa các chunk — chậm hơn hẳn tốc độ "burst" thông thường, đúng
// tinh thần "trong giới hạn" mà user đã duyệt cho gửi hàng loạt cá nhân.
const TICK_DELAY_MS = 30_000;

const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 604800 },
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 10_000 },
};

export interface BroadcastJobData { broadcastId: string }

let connection: Redis | null = null;
function getConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    connection = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    });
    connection.on('error', (err: Error) => {
      logger.error(`[broadcast-queue] redis error: ${err.message}`);
    });
    logger.info('[broadcast-queue] redis connection created');
  }
  return connection;
}

let queueInstance: Queue<BroadcastJobData> | null = null;
function getQueue(): Queue<BroadcastJobData> {
  if (!queueInstance) {
    queueInstance = new Queue<BroadcastJobData>(BROADCAST_QUEUE, {
      connection: getConnection() as ConnectionOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queueInstance.on('error', (err) => {
      logger.error(`[broadcast-queue] queue error: ${err.message}`);
    });
    logger.info('[broadcast-queue] queue initialized');
  }
  return queueInstance;
}

/** Enqueue tick đầu tiên (route "start"/"resume" gọi). */
export async function enqueueBroadcastTick(broadcastId: string, delayMs = 0): Promise<void> {
  const queue = getQueue();
  await queue.add('broadcast-tick', { broadcastId }, { jobId: `bc-${broadcastId}-${Date.now()}`, delay: delayMs });
  logger.info(`[broadcast-queue] enqueued broadcastId=${broadcastId} delayMs=${delayMs}`);
}

let workerInstance: Worker<BroadcastJobData> | null = null;
let workerConnection: Redis | null = null;

export function startBroadcastWorker(): Worker<BroadcastJobData> {
  if (workerInstance) {
    logger.warn('[broadcast-worker] already started');
    return workerInstance;
  }
  workerConnection = getConnection().duplicate();
  workerInstance = new Worker<BroadcastJobData>(
    BROADCAST_QUEUE,
    async (job: Job<BroadcastJobData>) => {
      const result = await processBroadcastTick(job.data.broadcastId);
      if (result.state === 'running' || result.state === 'scheduled') {
        // 'running' = vẫn còn contact chưa xử lý; 'scheduled' = job BullMQ nổ
        // sớm hơn giờ hẹn (lệch giờ hệ thống) → re-enqueue đúng phần delay còn
        // thiếu (processBroadcastTick đã tính sẵn ở nextDelayMs).
        await enqueueBroadcastTick(job.data.broadcastId, result.nextDelayMs ?? TICK_DELAY_MS);
      }
      return result;
    },
    {
      connection: workerConnection as ConnectionOptions,
      // Concurrency 1: 1 nick gửi tuần tự — campaign_message đã rate-limited
      // per-nick, chạy song song nhiều job cùng nick = burst → Zalo anti-spam.
      concurrency: 1,
    },
  );
  workerInstance.on('completed', (job) => {
    logger.info(`[broadcast-worker] tick completed broadcastId=${job.data.broadcastId}`);
  });
  workerInstance.on('failed', (job, err) => {
    logger.error(
      `[broadcast-worker] tick failed broadcastId=${job?.data.broadcastId} attempt=${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`,
    );
  });
  workerInstance.on('error', (err) => {
    logger.error(`[broadcast-worker] error: ${err.message}`);
  });
  logger.info('[broadcast-worker] started');
  return workerInstance;
}

export async function stopBroadcastWorker(): Promise<void> {
  if (workerInstance) { await workerInstance.close(); workerInstance = null; }
  if (workerConnection) { await workerConnection.quit(); workerConnection = null; }
  if (queueInstance) { await queueInstance.close(); queueInstance = null; }
  if (connection) { await connection.quit(); connection = null; }
}
