// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * zalo-rate-limiter.ts — Per-account, per-operation-type rate limiting.
 * Uses Redis when REDIS_URL is set, otherwise in-memory Maps.
 * Redis is an acceleration/shared-counter layer, not a hard dependency for
 * ordinary 1-1 work. If Redis is unavailable, use the same conservative
 * in-process limiter instead of blocking the sales team completely.
 */
import type { OpCategory } from '../../shared/zalo-operations.js';
import type { RedisClient } from '../../shared/redis-client.js';
import { getRedis, isRedisConfigured } from '../../shared/redis-client.js';
import { randomUUID } from 'node:crypto';
// 2026-06-06 (Anh chốt) — trần SDK đọc từ DB (cấu hình ở màn Quản lý nick Zalo),
// KHÔNG còn hardcode trong file này.
import { getEffectiveLimit, ALL_CATEGORIES, DEFAULT_SDK_LIMITS, type CategoryLimit } from './sdk-limit-service.js';

interface DailyCounter { count: number; date: string; }
interface MemoryReservation { id: string; timestamp: number; }

const DAILY_KEY = (acct: string, cat: string) => `rl:daily:${acct}:${cat}`;
const BURST_KEY = (acct: string, cat: string) => `rl:burst:${acct}:${cat}`;

export class ZaloRateLimiter {
  private dailyCounts = new Map<string, DailyCounter>();
  private recentSends = new Map<string, MemoryReservation[]>();
  private redis: RedisClient | null = null;
  private redisChecked = false;

  private async getRedisClient(): Promise<RedisClient | null> {
    if (!this.redisChecked) {
      this.redisChecked = true;
      this.redis = await getRedis();
      if (this.redis) console.log('[rate-limiter] Using Redis backing');
      else if (isRedisConfigured()) console.warn('[rate-limiter] Redis unavailable — using conservative in-memory fallback');
    }
    return this.redis;
  }

  async checkLimits(accountId: string, category: OpCategory = 'message'): Promise<{ allowed: boolean; reason?: string }> {
    try {
      // #2026-06-06 (Anh chốt) — trần đọc từ DB (nick override → org default → fallback),
      // KHÔNG còn hardcode CATEGORY_LIMITS. Cache 60s trong sdk-limit-service.
      const eff = await getEffectiveLimit(accountId, category);
      const limits: CategoryLimit = { daily: eff.daily, burst: eff.burst, burstWindowMs: eff.burstWindowMs };
      const r = await this.getRedisClient();

      if (r) {
        try { return await this.checkRedis(r, accountId, category, limits); }
        catch (err) {
          console.warn('[rate-limiter] Redis check failed — using in-memory fallback', err);
        }
      }
      return this.checkMemory(accountId, category, limits);
    } catch {
      // The limiter must not become a single point of failure for normal chat.
      // getEffectiveLimit itself has a safe code fallback; use it here only if
      // a future implementation throws before returning that fallback.
      return this.checkMemory(accountId, category, DEFAULT_SDK_LIMITS[category] ?? DEFAULT_SDK_LIMITS.message);
    }
  }

  /** Reserve quota before an outbound provider call. Check-then-record is racy
   * when multiple CRM users send through the same Zalo account concurrently. */
  async reserve(accountId: string, category: OpCategory = 'message'): Promise<{ allowed: boolean; reason?: string; reservationId?: string }> {
    try {
      const eff = await getEffectiveLimit(accountId, category);
      const limits: CategoryLimit = { daily: eff.daily, burst: eff.burst, burstWindowMs: eff.burstWindowMs };
      const r = await this.getRedisClient();

      if (r) {
        try { return await this.reserveRedis(r, accountId, category, limits); }
        catch (err) {
          console.warn('[rate-limiter] Redis reservation failed — using in-memory fallback', err);
        }
      }
      return this.reserveMemory(accountId, category, limits);
    } catch {
      return this.reserveMemory(accountId, category, DEFAULT_SDK_LIMITS[category] ?? DEFAULT_SDK_LIMITS.message);
    }
  }

  private checkMemory(accountId: string, category: OpCategory, limits: CategoryLimit): { allowed: boolean; reason?: string } {
    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today && daily.count >= limits.daily) {
      return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
    }

    const now = Date.now();
    const recent = (this.recentSends.get(key) || []).filter(item => now - item.timestamp < limits.burstWindowMs);
    if (recent.length >= limits.burst) {
      return { allowed: false, reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)` };
    }
    return { allowed: true };
  }

  private async checkRedis(r: RedisClient, accountId: string, category: OpCategory, limits: CategoryLimit): Promise<{ allowed: boolean; reason?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = DAILY_KEY(accountId, category);
    const dailyVal = await r.hget(dailyKey, today);
    const dailyCount = dailyVal ? parseInt(dailyVal, 10) : 0;

    if (dailyCount >= limits.daily) {
      return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
    }

    const burstKey = BURST_KEY(accountId, category);
    const now = Date.now();
    await r.zremrangebyscore(burstKey, '-inf', String(now - limits.burstWindowMs));
    const burstCount = await r.zcard(burstKey);

    if (burstCount >= limits.burst) {
      return { allowed: false, reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)` };
    }
    return { allowed: true };
  }

  private reserveMemory(accountId: string, category: OpCategory, limits: CategoryLimit): { allowed: boolean; reason?: string; reservationId?: string } {
    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today && daily.count >= limits.daily) {
      return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
    }

    const now = Date.now();
    const recent = (this.recentSends.get(key) || []).filter(item => now - item.timestamp < limits.burstWindowMs);
    if (recent.length >= limits.burst) {
      return { allowed: false, reason: `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)` };
    }

    const reservationId = randomUUID();
    recent.push({ id: reservationId, timestamp: now });
    this.recentSends.set(key, recent);
    if (daily && daily.date === today) daily.count++;
    else this.dailyCounts.set(key, { count: 1, date: today });
    return { allowed: true, reservationId };
  }

  private async reserveRedis(r: RedisClient, accountId: string, category: OpCategory, limits: CategoryLimit): Promise<{ allowed: boolean; reason?: string; reservationId?: string }> {
    const today = new Date().toISOString().split('T')[0];
    const now = Date.now();
    const dailyKey = DAILY_KEY(accountId, category);
    const burstKey = BURST_KEY(accountId, category);
    const member = `${now}:${randomUUID()}`;

    // Daily and burst checks plus reservation must be one Redis atomic action.
    const result = await r.eval(
      `
        local daily = tonumber(redis.call('HGET', KEYS[1], ARGV[1]) or '0')
        if daily >= tonumber(ARGV[4]) then return {0, 1} end
        redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[2])
        local burst = tonumber(redis.call('ZCARD', KEYS[2]))
        if burst >= tonumber(ARGV[5]) then return {0, 2} end
        redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
        redis.call('EXPIRE', KEYS[1], 172800)
        redis.call('ZADD', KEYS[2], ARGV[3], ARGV[6])
        redis.call('PEXPIRE', KEYS[2], math.max(120000, tonumber(ARGV[7])))
        return {1, 0, ARGV[6]}
      `,
      2,
      dailyKey,
      burstKey,
      today,
      String(now - limits.burstWindowMs),
      String(now),
      String(limits.daily),
      String(limits.burst),
      member,
      String(limits.burstWindowMs),
    ) as unknown as [number | string, number | string, string | number];

    if (Number(result?.[0]) === 1) return { allowed: true, reservationId: String(result?.[2] ?? '') };
    return {
      allowed: false,
      reason: Number(result?.[1]) === 1
        ? `Đã đạt giới hạn ${limits.daily} ${category}/ngày`
        : `Quá nhanh (>${limits.burst} ${category}/${Math.round(limits.burstWindowMs / 1000)}s)`,
    };
  }

  /**
   * Release a reservation when the provider definitely rejected the request.
   * A timed-out network call is intentionally not released by the caller: Zalo
   * may have accepted it and releasing would permit a duplicate retry burst.
   */
  async release(accountId: string, category: OpCategory, reservationId?: string): Promise<void> {
    if (!reservationId) return;
    const r = await this.getRedisClient();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        await r.eval(
          `
            local removed = redis.call('ZREM', KEYS[2], ARGV[1])
            if removed == 1 then
              local current = tonumber(redis.call('HGET', KEYS[1], ARGV[2]) or '0')
              if current > 0 then redis.call('HINCRBY', KEYS[1], ARGV[2], -1) end
            end
            return removed
          `,
          2,
          DAILY_KEY(accountId, category),
          BURST_KEY(accountId, category),
          reservationId,
          today,
        );
        return;
      } catch (err) {
        console.warn('[rate-limiter] Redis release failed; trying local mirror', err);
      }
    }

    const key = `${accountId}:${category}`;
    const recent = this.recentSends.get(key) ?? [];
    const index = recent.findIndex(item => item.id === reservationId);
    if (index >= 0) recent.splice(index, 1);
    if (recent.length === 0) this.recentSends.delete(key);
    else this.recentSends.set(key, recent);
    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === new Date().toISOString().split('T')[0] && index >= 0) {
      daily.count = Math.max(0, daily.count - 1);
      if (daily.count === 0) this.dailyCounts.delete(key);
    }
  }

  async recordSend(accountId: string, category: OpCategory = 'message'): Promise<void> {
    const r = await this.getRedisClient();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const dailyKey = DAILY_KEY(accountId, category);
        await r.hincrby(dailyKey, today, 1);
        await r.expire(dailyKey, 86400 * 2);

        const burstKey = BURST_KEY(accountId, category);
        const now = Date.now();
        await r.zadd(burstKey, String(now), `${now}`);
        await r.pexpire(burstKey, 120_000);
        return;
      } catch { /* fall through to in-memory */ }
    }

    const key = `${accountId}:${category}`;
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    const recent = (this.recentSends.get(key) || []).filter(item => now - item.timestamp < 60_000);
    recent.push({ id: randomUUID(), timestamp: now });
    this.recentSends.set(key, recent);

    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today) daily.count++;
    else this.dailyCounts.set(key, { count: 1, date: today });
  }

  // 2026-06-06 — đếm OPERATION-LEVEL riêng (vd 'contact_sync' = getAllFriends) cho dashboard.
  // Không ảnh hưởng rate-limit (chỉ là counter metric). Key: rl:op:<acct>:<op>.
  async recordOperation(accountId: string, op: string): Promise<void> {
    const r = await this.getRedisClient();
    if (!r) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const key = `rl:op:${accountId}:${op}`;
      await r.hincrby(key, today, 1);
      await r.expire(key, 86400 * 9); // giữ ~9 ngày cho sparkline 7 ngày
    } catch { /* metric best-effort */ }
  }

  async getOperationCount(accountId: string, op: string): Promise<number> {
    const r = await this.getRedisClient();
    if (!r) return 0;
    try {
      const today = new Date().toISOString().split('T')[0];
      const val = await r.hget(`rl:op:${accountId}:${op}`, today);
      return val ? parseInt(val, 10) : 0;
    } catch { return 0; }
  }

  async getDailyCount(accountId: string, category: OpCategory = 'message'): Promise<number> {
    const r = await this.getRedisClient();
    if (r) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const val = await r.hget(DAILY_KEY(accountId, category), today);
        return val ? parseInt(val, 10) : 0;
      } catch { /* fall through */ }
    }

    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyCounts.get(key);
    return daily && daily.date === today ? daily.count : 0;
  }

  async getAllDailyCounts(accountId: string): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const cat of ALL_CATEGORIES) {
      result[cat] = await this.getDailyCount(accountId, cat as OpCategory);
    }
    return result;
  }

  /** @deprecated trần thật giờ per-nick từ DB (sdk-limit-service.getEffectiveLimit).
   *  Hàm này chỉ trả fallback hằng số, giữ cho backward-compat. */
  getLimitsConfig(): Record<string, CategoryLimit> {
    return { ...DEFAULT_SDK_LIMITS };
  }
}

export const zaloRateLimiter = new ZaloRateLimiter();
