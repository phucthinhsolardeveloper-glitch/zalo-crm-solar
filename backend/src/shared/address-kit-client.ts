// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * address-kit-client.ts — fetch + cache danh sách tỉnh/thành, phường/xã chính
 * thức (mô hình 2 cấp) từ address-kit (production.cas.so).
 *
 * Dùng chung bởi:
 *   - modules/contacts/address-kit-routes.ts (proxy cho frontend)
 *   - modules/contacts/contact-import-service.ts (resolve mã tỉnh khi ghi Contact)
 *   - scripts/backfill-contact-address-2tier.ts (resolve mã tỉnh hàng loạt)
 * Cache in-memory theo tiến trình — ranh giới tỉnh/xã gần như không đổi giữa
 * các lần chạy, không cần refetch liên tục.
 */
const UPSTREAM_BASE = 'https://production.cas.so/address-kit/latest';

export interface AddressUnit { code: string; name: string }

const clean = (s: unknown): string => String(s ?? '').replace(/\s+/g, ' ').trim();

let provincesCache: AddressUnit[] | null = null;
const wardsCache = new Map<string, AddressUnit[]>();

export async function fetchProvinces(): Promise<AddressUnit[]> {
  if (provincesCache) return provincesCache;
  const res = await fetch(`${UPSTREAM_BASE}/provinces`);
  if (!res.ok) throw new Error(`address-kit upstream ${res.status} (provinces)`);
  const json = await res.json() as { provinces?: Array<{ code: string; name: string }> };
  const list = (json.provinces ?? []).map((p) => ({ code: p.code, name: clean(p.name) }));
  provincesCache = list;
  return list;
}

export async function fetchWards(provinceCode: string): Promise<AddressUnit[]> {
  const hit = wardsCache.get(provinceCode);
  if (hit) return hit;
  const res = await fetch(`${UPSTREAM_BASE}/provinces/${encodeURIComponent(provinceCode)}/communes`);
  if (!res.ok) throw new Error(`address-kit upstream ${res.status} (wards province=${provinceCode})`);
  const json = await res.json() as { communes?: Array<{ code: string; name: string }> };
  const list = (json.communes ?? []).map((c) => ({ code: c.code, name: clean(c.name) }));
  wardsCache.set(provinceCode, list);
  return list;
}

/** Bỏ dấu + hạ thường + bỏ tiền tố hành chính, để so khớp tên tỉnh/xã giữa 2 nguồn dữ liệu. */
function normalizeUnitName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi')
    .replace(/^(tinh|thanh pho|tp\.?)\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Resolve tên tỉnh (chuỗi tự do, có thể có/không tiền tố "Tỉnh"/"Thành phố") → mã tỉnh chính thức. */
export async function resolveProvinceCode(provinceName: string): Promise<string | null> {
  const target = normalizeUnitName(provinceName);
  if (!target) return null;
  const provinces = await fetchProvinces();
  const match = provinces.find((p) => normalizeUnitName(p.name) === target);
  return match?.code ?? null;
}

/** Resolve tên xã/phường (chuỗi tự do) trong 1 tỉnh đã biết mã → mã xã chính thức. */
export async function resolveWardCode(provinceCode: string, wardName: string): Promise<string | null> {
  const target = normalizeUnitName(wardName);
  if (!target) return null;
  const wards = await fetchWards(provinceCode);
  const match = wards.find((w) => normalizeUnitName(w.name) === target);
  return match?.code ?? null;
}
