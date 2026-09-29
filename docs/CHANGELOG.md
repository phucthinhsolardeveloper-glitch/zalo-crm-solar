# Documentation changelog

## 2026-09-29

- Lịch sử cuộc gọi hiển thị trạng thái kết bạn Zalo và cho gửi lời mời thủ công qua nick đang kết nối; tra cứu theo số chỉ chạy sau thao tác người dùng.
- Cảnh báo trước khi mở thêm hội thoại cho khách hàng đang được nick Zalo khác chăm sóc.
- Import khách hàng bắt buộc Họ tên, SĐT và Tỉnh/Thành phố; Phường/Xã vẫn tùy chọn.
- Import hỗ trợ bộ ba địa chỉ cũ và tự chuyển sang tỉnh/xã mới theo bảng sáp nhập; trường hợp mơ hồ/không khớp được đưa ra review, địa chỉ cũ được lưu trong metadata.
- Giữ backlog cho ánh xạ địa chỉ cũ–mới, Zalo OA/broadcast và tích hợp tồn kho đến khi có dữ liệu hoặc cấu hình chính thức.
- Cập nhật production snapshot sang VPS `pts-prod-01`, source `/srv/zcrm` và domain HTTPS `zcrm.phucthinhsolar.com`.
- Ghi topology Caddy edge network, compose override server-local và local storage không chạy MinIO mặc định.
- Ghi database mới có 119 migration, đang chờ owner initial setup; OmiCall/ZCC tắt.
- Cập nhật setup UI theo ngữ cảnh CRM nội bộ công ty.

## 2026-08-24

- Tái dựng canonical docs từ code/config/schema/test/runtime của `zalo-crm-solar`.
- Mở rộng context sang `crm-custom` và relay OmiCall giữa hai hệ.
- Lưu legacy theo ba source riêng: Zalo CRM, CRM Custom, IT root.
- Redact plaintext credential trong legacy archive; không thay đổi nội dung không nhạy cảm.
- Ghi production snapshot, test baseline, blockers và UNKNOWN.

Product/code changelog lịch sử nằm trong legacy archive và Git history; file này chỉ theo dõi canonical documentation.
