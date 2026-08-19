// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { describe, it, expect } from 'vitest';
import { safeParseEntities } from '../../src/modules/ai/schemas/extracted-entities.js';
import { parseResponse } from '../../src/modules/ai/ai-virtual-chat-service.js';

describe('Virtual Chat Real-world Consultation Scenarios', () => {
  it('Scenario 1: Full household contact + solar requirement (Tên, SĐT, Tiền điện, Mái tôn)', () => {
    const raw = `Em ghi nhận anh Hoàng (SĐT: 0912345678) ở Hải Châu, Đà Nẵng, nhà phố 3 tầng, tiền điện khoảng 4-5 triệu/tháng và mái tôn 80m². Khách muốn lắp để giảm tiền điện ban ngày. Em đề xuất anh gửi bảng dự toán 6kWp hòa lưới bám tải và hẹn lịch kỹ thuật viên qua đo đạc khảo sát thực tế nhé.

---JSON---
{
  "fullName": "Nguyễn Văn Hoàng",
  "gender": "M",
  "phone": "0912345678",
  "province": "Đà Nẵng",
  "district": "Hải Châu",
  "solarNeed": {
    "projectType": "nha_pho",
    "usagePurpose": "sinh_hoat",
    "monthlyElectricityBillMin": 4000000,
    "monthlyElectricityBillMax": 5000000,
    "usageTime": "ban_ngay",
    "roofType": "mai_ton",
    "roofAreaM2": 80,
    "systemType": "hoa_luoi",
    "purpose": "giam_tien_dien",
    "interestLevel": "can_bao_gia",
    "location": "Hải Châu, Đà Nẵng"
  },
  "confidenceScore": 0.95,
  "missingFields": []
}`;

    const { reply, entities } = parseResponse(raw);
    expect(reply).toContain('anh Hoàng');
    expect(reply).toContain('0912345678');
    expect(entities).not.toBeNull();

    const parsed = safeParseEntities(entities);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.fullName).toBe('Nguyễn Văn Hoàng');
    expect(parsed.data.phone).toBe('0912345678');
    expect(parsed.data.province).toBe('Đà Nẵng');
    expect(parsed.data.solarNeed?.projectType).toBe('nha_pho');
    expect(parsed.data.solarNeed?.monthlyElectricityBillMin).toBe(4000000);
    expect(parsed.data.solarNeed?.monthlyElectricityBillMax).toBe(5000000);
    expect(parsed.data.solarNeed?.roofType).toBe('mai_ton');
    expect(parsed.data.solarNeed?.roofAreaM2).toBe(80);
    expect(parsed.data.solarNeed?.systemType).toBe('hoa_luoi');
    expect(parsed.data.missingFields).toEqual([]);
  });

  it('Scenario 2: Factory with high bill but MISSING name and phone (AI suggests asking for contact/Zalo)', () => {
    const raw = `Em ghi nhận khách hàng có xưởng sản xuất ở Cẩm Lệ, tiền điện 20 triệu/tháng, mái tôn 300m² và dùng điện chủ yếu ban ngày. Anh xin thêm Tên người phụ trách và Số điện thoại/Zalo để mình gửi bảng mô phỏng sản lượng và phương án hoàn vốn nhé.

---JSON---
{
  "fullName": null,
  "gender": null,
  "phone": null,
  "province": "Đà Nẵng",
  "district": "Cẩm Lệ",
  "solarNeed": {
    "projectType": "nha_xuong",
    "usagePurpose": "san_xuat",
    "monthlyElectricityBillMin": 20000000,
    "monthlyElectricityBillMax": 20000000,
    "usageTime": "ban_ngay",
    "roofType": "mai_ton",
    "roofAreaM2": 300,
    "purpose": "toi_uu_chi_phi",
    "location": "Cẩm Lệ, Đà Nẵng"
  },
  "confidenceScore": 0.9,
  "missingFields": ["fullName", "phone"]
}`;

    const { reply, entities } = parseResponse(raw);
    expect(reply).toContain('xin thêm Tên người phụ trách và Số điện thoại');
    expect(entities).not.toBeNull();

    const parsed = safeParseEntities(entities);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.phone).toBeUndefined();
    expect(parsed.data.solarNeed?.monthlyElectricityBillMin).toBe(20000000);
    expect(parsed.data.solarNeed?.projectType).toBe('nha_xuong');
    expect(parsed.data.missingFields).toContain('phone');
    expect(parsed.data.missingFields).toContain('fullName');
  });

  it('Scenario 3: Referral lead with Name, Phone but MISSING monthly bill and roof type (AI suggests inquiring bill & roof)', () => {
    const raw = `Em ghi nhận chị Phương (SĐT: 0987654321) được anh Hùng giới thiệu, đang quan tâm lắp điện mặt trời cho biệt thự. Anh hỏi thêm chị Phương mức tiền điện trung bình hàng tháng khoảng bao nhiêu triệu và nhà chị dùng mái gì (ngói hay sân thượng bê tông) để tư vấn loại tấm pin phù hợp nhé.

---JSON---
{
  "fullName": "Phương",
  "gender": "F",
  "phone": "0987654321",
  "solarNeed": {
    "projectType": "biet_thu",
    "usagePurpose": "sinh_hoat",
    "interestLevel": "quan_tam"
  },
  "leadSource": "gioi_thieu",
  "tags": ["gioi-thieu-tu-anh-Hung"],
  "confidenceScore": 0.88,
  "missingFields": ["monthlyElectricityBill", "roofType", "province"]
}`;

    const { reply, entities } = parseResponse(raw);
    expect(reply).toContain('mức tiền điện trung bình');
    expect(reply).toContain('loại tấm pin phù hợp');
    expect(entities).not.toBeNull();

    const parsed = safeParseEntities(entities);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.fullName).toBe('Phương');
    expect(parsed.data.phone).toBe('0987654321');
    expect(parsed.data.solarNeed?.projectType).toBe('biet_thu');
    expect(parsed.data.leadSource).toBe('gioi_thieu');
    expect(parsed.data.tags).toContain('gioi-thieu-tu-anh-Hung');
    expect(parsed.data.missingFields).toEqual(['monthlyElectricityBill', 'roofType', 'province']);
  });
});
