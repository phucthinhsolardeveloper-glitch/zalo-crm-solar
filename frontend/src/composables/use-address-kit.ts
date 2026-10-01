// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * use-address-kit.ts — danh sách tỉnh/thành + phường/xã chính thức (mô hình 2
 * cấp, sau sáp nhập 1/7/2025). Gọi qua backend proxy (/api/v1/address/*) —
 * xem backend/src/modules/contacts/address-kit-routes.ts. Tỉnh/xã gần như
 * không đổi → cache 1 năm ở localStorage (port từ crm-custom/apps/web/src/lib/address-kit.ts).
 */
import { api } from '@/api/index';

export interface AddressUnit {
  code: string;
  name: string;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface CacheEntry<T> { t: number; v: T }

function readCache<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.t > ONE_YEAR_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed.v;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, v: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ t: Date.now(), v } satisfies CacheEntry<T>));
  } catch {
    // localStorage đầy/bị chặn — bỏ qua, vẫn chạy bằng network lần sau.
  }
}

export async function fetchProvinces(): Promise<AddressUnit[]> {
  const key = 'addresskit:v1:provinces';
  const cached = readCache<AddressUnit[]>(key);
  if (cached) return cached;
  const res = await api.get<{ provinces: AddressUnit[] }>('/address/provinces');
  const list = res.data.provinces ?? [];
  writeCache(key, list);
  return list;
}

export async function fetchWards(provinceCode: string): Promise<AddressUnit[]> {
  const key = `addresskit:v1:wards:${provinceCode}`;
  const cached = readCache<AddressUnit[]>(key);
  if (cached) return cached;
  const res = await api.get<{ wards: AddressUnit[] }>(`/address/provinces/${encodeURIComponent(provinceCode)}/wards`);
  const list = res.data.wards ?? [];
  writeCache(key, list);
  return list;
}
