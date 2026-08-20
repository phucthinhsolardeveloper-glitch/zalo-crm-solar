// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { describe, it, expect } from 'vitest';
import { safeParseEntities } from '../../src/modules/ai/schemas/extracted-entities.js';
import { parseResponse } from '../../src/modules/ai/ai-virtual-chat-service.js';

describe('safeParseEntities — Solar extracted entities', () => {
  it('parses complete SolarNeed payload correctly', () => {
    const raw = {
      fullName: 'Nguyễn Văn Nam',
      gender: 'M',
      birthYear: 1980,
      industry: 'Kinh doanh tự do',
      phone: '0901234567',
      province: 'Đà Nẵng',
      district: 'Hải Châu',
      address: '123 Nguyễn Văn Linh',
      solarNeed: {
        projectType: 'nha_o',
        usagePurpose: 'sinh_hoat',
        monthlyElectricityBillMin: 3000000,
        monthlyElectricityBillMax: 4000000,
        monthlyConsumptionKwh: 600,
        usageTime: 'ban_ngay',
        largeLoads: ['dieu_hoa', 'binh_nong_lanh'],
        roofType: 'mai_ton',
        roofAreaM2: 100,
        roofCondition: 'tot',
        systemType: 'hoa_luoi',
        batteryStorage: false,
        desiredCapacityKwp: 5,
        purpose: 'giam_tien_dien',
        installationTimeline: '1_thang',
        interestLevel: 'can_bao_gia',
        location: 'Đà Nẵng',
      },
      leadSource: 'facebook',
      tags: ['nha-o', 'tieu-thu-cao'],
      confidenceScore: 0.95,
      missingFields: ['systemType'],
    };

    const res = safeParseEntities(raw);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.fullName).toBe('Nguyễn Văn Nam');
    expect(res.data.gender).toBe('M');
    expect(res.data.phone).toBe('0901234567');
    expect(res.data.address).toBe('123 Nguyễn Văn Linh');
    expect(res.data.solarNeed?.projectType).toBe('nha_o');
    expect(res.data.solarNeed?.monthlyElectricityBillMin).toBe(3000000);
    expect(res.data.solarNeed?.roofAreaM2).toBe(100);
    expect(res.data.solarNeed?.batteryStorage).toBe(false);
    expect(res.data.leadSource).toBe('facebook');
    expect(res.data.confidenceScore).toBe(0.95);
  });

  it('calculates birthYear from age when birthYear is missing', () => {
    const raw = {
      fullName: 'Chị Lan',
      gender: 'F',
      age: 40,
      confidenceScore: 0.8,
    };

    const res = safeParseEntities(raw);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.age).toBe(40);
    const expectedYear = new Date().getFullYear() - 40;
    expect(res.data.birthYear).toBe(expectedYear);
  });

  it('handles partial solarNeed and drops invalid enums (fail-open)', () => {
    const raw = {
      solarNeed: {
        projectType: 'invalid_type_abc',
        usagePurpose: 'sinh_hoat',
        monthlyElectricityBillMin: 5000000,
        roofType: 'mai_ton',
      },
      confidenceScore: 0.85,
    };

    const res = safeParseEntities(raw);
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.solarNeed?.projectType).toBeUndefined();
    expect(res.data.solarNeed?.usagePurpose).toBe('sinh_hoat');
    expect(res.data.solarNeed?.monthlyElectricityBillMin).toBe(5000000);
    expect(res.data.solarNeed?.roofType).toBe('mai_ton');
  });

  it('fails gracefully when input is not an object', () => {
    expect(safeParseEntities(null).success).toBe(false);
    expect(safeParseEntities('string').success).toBe(false);
    expect(safeParseEntities(123).success).toBe(false);
  });

  it('coerces numeric fields sent as strings by the LLM instead of dropping them', () => {
    const raw = {
      birthYear: '1985',
      age: '40',
      solarNeed: {
        monthlyElectricityBillMin: '3000000',
        roofAreaM2: '100',
        desiredCapacityKwp: '5.5',
      },
      confidenceScore: 0.9,
    };
    const res = safeParseEntities(raw);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.birthYear).toBe(1985);
    expect(res.data.solarNeed?.monthlyElectricityBillMin).toBe(3000000);
    expect(res.data.solarNeed?.roofAreaM2).toBe(100);
    expect(res.data.solarNeed?.desiredCapacityKwp).toBe(5.5);
  });

  it('still drops non-numeric strings and out-of-range values', () => {
    const raw = {
      solarNeed: { roofAreaM2: 'khong ro', desiredCapacityKwp: '-5' },
      confidenceScore: 0.9,
    };
    const res = safeParseEntities(raw);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.solarNeed?.roofAreaM2).toBeUndefined();
    expect(res.data.solarNeed?.desiredCapacityKwp).toBeUndefined();
  });
});

describe('parseResponse — Virtual Chat text + JSON splitting', () => {
  it('splits reply text and JSON entities cleanly', () => {
    const raw = `Em ghi nhận thông tin anh Nam ở Đà Nẵng. Anh hỏi thêm tiền điện trung bình nhé.

---JSON---
{
  "fullName": "Nam",
  "gender": "M",
  "province": "Đà Nẵng",
  "solarNeed": {
    "projectType": "nha_o",
    "monthlyElectricityBillMin": 3000000
  },
  "confidenceScore": 0.9,
  "missingFields": ["roofAreaM2"]
}`;

    const { reply, entities } = parseResponse(raw);
    expect(reply).toBe('Em ghi nhận thông tin anh Nam ở Đà Nẵng. Anh hỏi thêm tiền điện trung bình nhé.');
    expect(entities).not.toBeNull();
    expect(entities?.fullName).toBe('Nam');
    expect(entities?.solarNeed?.monthlyElectricityBillMin).toBe(3000000);
  });

  it('strips code fences if LLM wrapped JSON in ```json blocks', () => {
    const raw = `Ghi nhận thông tin khách.

---JSON---
\`\`\`json
{
  "fullName": "Hoa",
  "gender": "F",
  "confidenceScore": 0.85,
  "missingFields": []
}
\`\`\``;

    const { reply, entities } = parseResponse(raw);
    expect(reply).toBe('Ghi nhận thông tin khách.');
    expect(entities?.fullName).toBe('Hoa');
    expect(entities?.gender).toBe('F');
  });

  it('correctly parses combined contact details (phone, name, location) and solar requirements', () => {
    const raw = `Em ghi nhận chị Hoa (SĐT: 0905123456) tại Đà Nẵng, tiền điện 5 triệu/tháng. Anh hỏi thêm về loại mái nhé.

---JSON---
{
  "fullName": "Hoa",
  "gender": "F",
  "phone": "0905123456",
  "province": "Đà Nẵng",
  "solarNeed": {
    "projectType": "nha_o",
    "monthlyElectricityBillMin": 5000000,
    "monthlyElectricityBillMax": 5000000,
    "usageTime": "ban_ngay",
    "purpose": "giam_tien_dien"
  },
  "confidenceScore": 0.92,
  "missingFields": ["roofType", "roofAreaM2"]
}`;

    const { reply, entities } = parseResponse(raw);
    expect(reply).toContain('0905123456');
    expect(entities).not.toBeNull();
    expect(entities?.fullName).toBe('Hoa');
    expect(entities?.phone).toBe('0905123456');
    expect(entities?.province).toBe('Đà Nẵng');
    expect(entities?.solarNeed?.monthlyElectricityBillMin).toBe(5000000);
    expect(entities?.missingFields).toEqual(['roofType', 'roofAreaM2']);
  });

  it('does not leak the raw JSON block into reply when the model omits reply text', () => {
    const raw = `---JSON---
{"fullName":"Nam","confidenceScore":0.9,"missingFields":[]}`;
    const { reply, entities } = parseResponse(raw);
    expect(reply).toBe('');
    expect(reply).not.toContain('---JSON---');
    expect(reply).not.toContain('confidenceScore');
    expect(entities?.fullName).toBe('Nam');
  });
});

