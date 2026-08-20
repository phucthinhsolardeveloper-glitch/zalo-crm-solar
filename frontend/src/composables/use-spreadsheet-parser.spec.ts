// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { describe, it, expect } from 'vitest';
import { parseCsvText } from './use-spreadsheet-parser';

describe('parseCsvText', () => {
  it('bare CSV không quote — hành vi cũ vẫn đúng', () => {
    expect(parseCsvText('Tên,SĐT,Email\nNguyễn Văn A,0901234567,a@gmail.com'))
      .toEqual([
        ['Tên', 'SĐT', 'Email'],
        ['Nguyễn Văn A', '0901234567', 'a@gmail.com'],
      ]);
  });

  it('cell có dấu phẩy bên trong, được quote đúng chuẩn — parser cũ (split thô) sẽ vỡ ở đây', () => {
    const csv = 'Tên,Địa chỉ\nTrần Thị B,"123 Nguyễn Huệ, Quận 1, TP.HCM"';
    expect(parseCsvText(csv)).toEqual([
      ['Tên', 'Địa chỉ'],
      ['Trần Thị B', '123 Nguyễn Huệ, Quận 1, TP.HCM'],
    ]);
  });

  it('quote escape kiểu RFC4180 ("" bên trong field quoted) → 1 dấu ngoặc kép', () => {
    const csv = 'Tên,Ghi chú\nLê Văn C,"Khách nói ""để suy nghĩ thêm"""';
    expect(parseCsvText(csv)).toEqual([
      ['Tên', 'Ghi chú'],
      ['Lê Văn C', 'Khách nói "để suy nghĩ thêm"'],
    ]);
  });

  it('xuống dòng bên trong field quoted vẫn thuộc CÙNG 1 row (không tách nhầm dòng mới)', () => {
    const csv = 'Tên,Ghi chú\nPhạm Thị D,"Dòng 1\nDòng 2"\nVõ Văn E,bình thường';
    expect(parseCsvText(csv)).toEqual([
      ['Tên', 'Ghi chú'],
      ['Phạm Thị D', 'Dòng 1\nDòng 2'],
      ['Võ Văn E', 'bình thường'],
    ]);
  });

  it('BOM UTF-8 ở đầu file (Excel export) không dính vào cell đầu tiên', () => {
    const bom = '﻿';
    const csv = `${bom}Tên,SĐT\nHoàng Văn F,0912345678`;
    const rows = parseCsvText(csv);
    expect(rows[0][0]).toBe('Tên'); // KHÔNG phải "﻿Tên"
  });

  it('dòng cuối không có \\n kết thúc file vẫn được parse đủ', () => {
    const csv = 'Tên,SĐT\nĐặng Thị G,0987654321';
    expect(parseCsvText(csv)).toEqual([
      ['Tên', 'SĐT'],
      ['Đặng Thị G', '0987654321'],
    ]);
  });

  it('\\r\\n (Windows line ending, Excel export mặc định) parse đúng như \\n', () => {
    const csv = 'Tên,SĐT\r\nBùi Văn H,0909111222\r\nNgô Thị K,0909333444';
    expect(parseCsvText(csv)).toEqual([
      ['Tên', 'SĐT'],
      ['Bùi Văn H', '0909111222'],
      ['Ngô Thị K', '0909333444'],
    ]);
  });

  it('nhiều cell quoted trên cùng 1 dòng, trộn cả không-quote', () => {
    const csv = '"Nguyễn Văn A","123 Lê Lợi, Q.1",0901111222,Đại lý';
    expect(parseCsvText(csv)).toEqual([
      ['Nguyễn Văn A', '123 Lê Lợi, Q.1', '0901111222', 'Đại lý'],
    ]);
  });

  it('dữ liệu khách hàng thực tế điện mặt trời — nhiều cột, tiếng Việt có dấu đầy đủ', () => {
    const csv = [
      'Họ tên,SĐT,Ngành nghề,Địa chỉ,Đối tượng,Trạng thái',
      '"Nguyễn Thị Phúc","0909876543","Kinh doanh vật liệu xây dựng","45/2 Điện Biên Phủ, P.15, Bình Thạnh, TP.HCM","Đại lý","Đã mua hàng"',
      'Trần Văn Thịnh,0912345678,Chủ xưởng may,"12 Trường Chinh, Q.Tân Bình",Cá nhân,Báo giá',
    ].join('\r\n');
    const rows = parseCsvText(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([
      'Nguyễn Thị Phúc', '0909876543', 'Kinh doanh vật liệu xây dựng',
      '45/2 Điện Biên Phủ, P.15, Bình Thạnh, TP.HCM', 'Đại lý', 'Đã mua hàng',
    ]);
    expect(rows[2]).toEqual([
      'Trần Văn Thịnh', '0912345678', 'Chủ xưởng may',
      '12 Trường Chinh, Q.Tân Bình', 'Cá nhân', 'Báo giá',
    ]);
  });

  it('empty input → mảng rỗng', () => {
    expect(parseCsvText('')).toEqual([]);
  });
});
