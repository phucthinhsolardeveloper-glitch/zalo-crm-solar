// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * M53 2026-05-30 — Type + validator cho extracted entities AI Trợ Lý
 * trả về trong Virtual Chat (Phúc Thịnh Solar). Mapping qua Contact fields.
 *
 * KHÔNG dùng zod vì backend chưa có dep — dùng manual type guard fail-open.
 */

export type Gender = 'M' | 'F' | null;

export type SolarProjectType =
  | 'nha_o'
  | 'biet_thu'
  | 'nha_pho'
  | 'van_phong'
  | 'cua_hang'
  | 'nha_xuong'
  | 'kho'
  | 'trang_trai'
  | 'khach_san'
  | 'truong_hoc'
  | 'khac';

export type SolarUsagePurpose = 'sinh_hoat' | 'kinh_doanh' | 'san_xuat' | 'hon_hop' | 'khac';
export type SolarUsageTime = 'ban_ngay' | 'buoi_toi' | 'ca_ngay' | 'chua_ro';
export type SolarRoofType = 'mai_ton' | 'mai_ngoi' | 'mai_be_tong' | 'mai_nha_xuong' | 'khac' | 'chua_ro';
export type SolarRoofCondition = 'tot' | 'can_sua_chua' | 'chua_ro';
export type SolarSystemType = 'hoa_luoi' | 'hoa_luoi_co_luu_tru' | 'doc_lap' | 'chua_ro';
export type SolarPurpose =
  | 'giam_tien_dien'
  | 'du_phong_mat_dien'
  | 'chu_dong_nguon_dien'
  | 'phuc_vu_san_xuat'
  | 'toi_uu_chi_phi'
  | 'khac';
export type SolarInstallationTimeline = 'ngay' | '1_thang' | '1_3_thang' | '3_6_thang' | 'chua_xac_dinh';
export type SolarInterestLevel =
  | 'dang_tim_hieu'
  | 'quan_tam'
  | 'can_khao_sat'
  | 'can_bao_gia'
  | 'dang_so_sanh'
  | 'san_sang_trien_khai';

export type SolarLeadSource =
  | 'facebook'
  | 'zalo'
  | 'tiktok'
  | 'google'
  | 'website'
  | 'gioi_thieu'
  | 'khach_cu'
  | 'hotline'
  | 'nhan_vien_tiep_can'
  | 'khac';

export interface ExtractedSolarNeed {
  projectType?: SolarProjectType;
  usagePurpose?: SolarUsagePurpose;
  monthlyElectricityBillMin?: number; // VNĐ
  monthlyElectricityBillMax?: number; // VNĐ
  monthlyConsumptionKwh?: number; // kWh/tháng
  usageTime?: SolarUsageTime;
  largeLoads?: string[];
  roofType?: SolarRoofType;
  roofAreaM2?: number; // m²
  roofCondition?: SolarRoofCondition;
  shading?: string | null;
  systemType?: SolarSystemType;
  batteryStorage?: boolean | null;
  desiredCapacityKwp?: number; // kWp
  purpose?: SolarPurpose;
  budgetMin?: number; // VNĐ
  budgetMax?: number; // VNĐ
  installationTimeline?: SolarInstallationTimeline;
  interestLevel?: SolarInterestLevel;
  location?: string;
}

/** @deprecated Legacy Real-estate Need schema */
export interface ExtractedPropertyNeed {
  type?: string;
  budgetMin?: number;
  budgetMax?: number;
  purpose?: string;
  decisionTimeline?: string;
  area?: string;
}

export interface ExtractedEntities {
  fullName?: string;
  gender?: Gender;
  birthYear?: number;
  age?: number;
  occupation?: string;
  phone?: string;
  province?: string;
  district?: string;
  ward?: string;
  address?: string;
  addressLine?: string;
  solarNeed?: ExtractedSolarNeed;
  propertyNeed?: ExtractedPropertyNeed;
  leadSource?: SolarLeadSource;
  tags?: string[];
  confidenceScore: number;
  missingFields: string[];
}

const ENUM_PROJECT_TYPE = new Set<string>([
  'nha_o', 'biet_thu', 'nha_pho', 'van_phong', 'cua_hang',
  'nha_xuong', 'kho', 'trang_trai', 'khach_san', 'truong_hoc', 'khac',
]);
const ENUM_USAGE_PURPOSE = new Set<string>(['sinh_hoat', 'kinh_doanh', 'san_xuat', 'hon_hop', 'khac']);
const ENUM_USAGE_TIME = new Set<string>(['ban_ngay', 'buoi_toi', 'ca_ngay', 'chua_ro']);
const ENUM_ROOF_TYPE = new Set<string>(['mai_ton', 'mai_ngoi', 'mai_be_tong', 'mai_nha_xuong', 'khac', 'chua_ro']);
const ENUM_ROOF_CONDITION = new Set<string>(['tot', 'can_sua_chua', 'chua_ro']);
const ENUM_SYSTEM_TYPE = new Set<string>(['hoa_luoi', 'hoa_luoi_co_luu_tru', 'doc_lap', 'chua_ro']);
const ENUM_SOLAR_PURPOSE = new Set<string>([
  'giam_tien_dien', 'du_phong_mat_dien', 'chu_dong_nguon_dien',
  'phuc_vu_san_xuat', 'toi_uu_chi_phi', 'khac',
]);
const ENUM_INSTALLATION_TIMELINE = new Set<string>(['ngay', '1_thang', '1_3_thang', '3_6_thang', 'chua_xac_dinh']);
const ENUM_INTEREST_LEVEL = new Set<string>([
  'dang_tim_hieu', 'quan_tam', 'can_khao_sat', 'can_bao_gia', 'dang_so_sanh', 'san_sang_trien_khai',
]);
const ENUM_LEAD_SOURCE = new Set<string>([
  'facebook', 'zalo', 'tiktok', 'google', 'website', 'gioi_thieu', 'khach_cu', 'hotline', 'nhan_vien_tiep_can', 'khac',
]);

/**
 * LLM đôi khi trả số dạng chuỗi ("100" thay vì 100) dù prompt đã yêu cầu number —
 * coerce trước khi validate range, tránh rớt dữ liệu đã trích xuất đúng chỉ vì kiểu sai.
 */
function coerceNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Manual safeParse — fail open: drop invalid field but keep valid ones.
 * Trả fail nếu input KHÔNG phải object.
 */
export function safeParseEntities(input: unknown): { success: true; data: ExtractedEntities } | { success: false; error: string } {
  if (!input || typeof input !== 'object') {
    return { success: false, error: 'Not an object' };
  }
  const obj = input as Record<string, unknown>;
  const out: ExtractedEntities = {
    confidenceScore: typeof obj.confidenceScore === 'number'
      ? Math.max(0, Math.min(1, obj.confidenceScore))
      : 0,
    missingFields: Array.isArray(obj.missingFields)
      ? obj.missingFields.filter((s) => typeof s === 'string').slice(0, 20) as string[]
      : [],
  };

  if (typeof obj.fullName === 'string' && obj.fullName.trim().length > 0 && obj.fullName.length <= 200) {
    out.fullName = obj.fullName.trim();
  }
  if (obj.gender === 'M' || obj.gender === 'F') {
    out.gender = obj.gender;
  }
  const birthYearNum = coerceNumber(obj.birthYear);
  if (birthYearNum !== undefined && birthYearNum >= 1930 && birthYearNum <= 2020) {
    out.birthYear = Math.floor(birthYearNum);
  }
  const ageNum = coerceNumber(obj.age);
  if (ageNum !== undefined && ageNum >= 10 && ageNum <= 100) {
    out.age = Math.floor(ageNum);
    if (!out.birthYear) {
      out.birthYear = new Date().getFullYear() - out.age;
    }
  }
  if (typeof obj.occupation === 'string' && obj.occupation.trim().length > 0 && obj.occupation.length <= 200) {
    out.occupation = obj.occupation.trim();
  }
  if (typeof obj.phone === 'string' && obj.phone.trim().length >= 8 && obj.phone.length <= 30) {
    out.phone = obj.phone.trim();
  }
  if (typeof obj.province === 'string' && obj.province.trim().length > 0) {
    out.province = obj.province.trim().slice(0, 100);
  }
  if (typeof obj.district === 'string' && obj.district.trim().length > 0) {
    out.district = obj.district.trim().slice(0, 100);
  }
  if (typeof obj.ward === 'string' && obj.ward.trim().length > 0) {
    out.ward = obj.ward.trim().slice(0, 100);
  }
  if (typeof obj.address === 'string' && obj.address.trim().length > 0) {
    out.address = obj.address.trim().slice(0, 255);
    out.addressLine = out.address;
  } else if (typeof obj.addressLine === 'string' && obj.addressLine.trim().length > 0) {
    out.addressLine = obj.addressLine.trim().slice(0, 255);
    out.address = out.addressLine;
  }

  if (typeof obj.leadSource === 'string' && ENUM_LEAD_SOURCE.has(obj.leadSource)) {
    out.leadSource = obj.leadSource as SolarLeadSource;
  }
  if (Array.isArray(obj.tags)) {
    out.tags = obj.tags
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .slice(0, 10)
      .map((t) => (t as string).trim().slice(0, 50));
  }

  // Parse SolarNeed
  if (obj.solarNeed && typeof obj.solarNeed === 'object') {
    const sn = obj.solarNeed as Record<string, unknown>;
    const need: ExtractedSolarNeed = {};

    if (typeof sn.projectType === 'string' && ENUM_PROJECT_TYPE.has(sn.projectType)) {
      need.projectType = sn.projectType as SolarProjectType;
    }
    if (typeof sn.usagePurpose === 'string' && ENUM_USAGE_PURPOSE.has(sn.usagePurpose)) {
      need.usagePurpose = sn.usagePurpose as SolarUsagePurpose;
    }
    const billMin = coerceNumber(sn.monthlyElectricityBillMin);
    if (billMin !== undefined && billMin > 0) need.monthlyElectricityBillMin = billMin;
    const billMax = coerceNumber(sn.monthlyElectricityBillMax);
    if (billMax !== undefined && billMax > 0) need.monthlyElectricityBillMax = billMax;
    const consumptionKwh = coerceNumber(sn.monthlyConsumptionKwh);
    if (consumptionKwh !== undefined && consumptionKwh > 0) need.monthlyConsumptionKwh = consumptionKwh;
    if (typeof sn.usageTime === 'string' && ENUM_USAGE_TIME.has(sn.usageTime)) {
      need.usageTime = sn.usageTime as SolarUsageTime;
    }
    if (Array.isArray(sn.largeLoads)) {
      need.largeLoads = sn.largeLoads
        .filter((l) => typeof l === 'string' && l.trim().length > 0)
        .slice(0, 10)
        .map((l) => (l as string).trim().slice(0, 50));
    }
    if (typeof sn.roofType === 'string' && ENUM_ROOF_TYPE.has(sn.roofType)) {
      need.roofType = sn.roofType as SolarRoofType;
    }
    const roofArea = coerceNumber(sn.roofAreaM2);
    if (roofArea !== undefined && roofArea > 0 && roofArea < 100000) need.roofAreaM2 = roofArea;
    if (typeof sn.roofCondition === 'string' && ENUM_ROOF_CONDITION.has(sn.roofCondition)) {
      need.roofCondition = sn.roofCondition as SolarRoofCondition;
    }
    if (typeof sn.shading === 'string' && sn.shading.trim().length > 0) {
      need.shading = sn.shading.trim().slice(0, 100);
    }
    if (typeof sn.systemType === 'string' && ENUM_SYSTEM_TYPE.has(sn.systemType)) {
      need.systemType = sn.systemType as SolarSystemType;
    }
    if (typeof sn.batteryStorage === 'boolean') {
      need.batteryStorage = sn.batteryStorage;
    }
    const capacityKwp = coerceNumber(sn.desiredCapacityKwp);
    if (capacityKwp !== undefined && capacityKwp > 0 && capacityKwp < 10000) need.desiredCapacityKwp = capacityKwp;
    if (typeof sn.purpose === 'string' && ENUM_SOLAR_PURPOSE.has(sn.purpose)) {
      need.purpose = sn.purpose as SolarPurpose;
    }
    const solarBudgetMin = coerceNumber(sn.budgetMin);
    if (solarBudgetMin !== undefined && solarBudgetMin > 0) need.budgetMin = solarBudgetMin;
    const solarBudgetMax = coerceNumber(sn.budgetMax);
    if (solarBudgetMax !== undefined && solarBudgetMax > 0) need.budgetMax = solarBudgetMax;
    if (typeof sn.installationTimeline === 'string' && ENUM_INSTALLATION_TIMELINE.has(sn.installationTimeline)) {
      need.installationTimeline = sn.installationTimeline as SolarInstallationTimeline;
    }
    if (typeof sn.interestLevel === 'string' && ENUM_INTEREST_LEVEL.has(sn.interestLevel)) {
      need.interestLevel = sn.interestLevel as SolarInterestLevel;
    }
    if (typeof sn.location === 'string' && sn.location.trim().length > 0) {
      need.location = sn.location.trim().slice(0, 200);
    }

    if (Object.keys(need).length > 0) {
      out.solarNeed = need;
    }
  }

  // Fallback: Legacy PropertyNeed
  if (obj.propertyNeed && typeof obj.propertyNeed === 'object') {
    const pn = obj.propertyNeed as Record<string, unknown>;
    const legacyNeed: ExtractedPropertyNeed = {};
    if (typeof pn.type === 'string') legacyNeed.type = pn.type.slice(0, 50);
    const legacyBudgetMin = coerceNumber(pn.budgetMin);
    if (legacyBudgetMin !== undefined && legacyBudgetMin > 0) legacyNeed.budgetMin = legacyBudgetMin;
    const legacyBudgetMax = coerceNumber(pn.budgetMax);
    if (legacyBudgetMax !== undefined && legacyBudgetMax > 0) legacyNeed.budgetMax = legacyBudgetMax;
    if (typeof pn.purpose === 'string') legacyNeed.purpose = pn.purpose.slice(0, 50);
    if (typeof pn.decisionTimeline === 'string') legacyNeed.decisionTimeline = pn.decisionTimeline.slice(0, 50);
    if (typeof pn.area === 'string') legacyNeed.area = pn.area.slice(0, 200);
    if (Object.keys(legacyNeed).length > 0) out.propertyNeed = legacyNeed;
  }

  return { success: true, data: out };
}
