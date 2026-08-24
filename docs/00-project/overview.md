# Tổng quan project

ZCRM Solar giải quyết việc tập trung nhiều nick Zalo cá nhân của đội sales vào một CRM web đa tenant. Người dùng thực tế được suy ra từ code/UI là owner/admin, quản lý/phòng ban và nhân viên phụ trách khách hàng.

## Workflow chính đã có implementation

- Tạo organization/owner, đăng nhập bằng email hoặc số điện thoại, refresh token rotation.
- QR login và quản lý Zalo account; đồng bộ bạn bè, hội thoại, tin nhắn, nhóm và presence.
- Contact CRM, import/export, tag/status, note, appointment, scoring/engagement và danh sách khách hàng.
- Chat realtime, media, template, AI suggestion/RAG, Telegram bridge.
- OmiCall WebRTC/PSTN, call history, note theo số điện thoại, recording mã hoá và playback qua route có auth.
- Department, permission group và ownership scope; audit/security event.

## Edition boundary

Backend nạp optional `src/_ee/index.js`; directory `_ee` không có trong repository ngày 2026-08-24. Frontend dùng `_ee-stubs`. Vì vậy automation/Lead Ads/extension routes được schema lưu lại hoặc có stub/comment nhưng không phải toàn bộ runtime Community. Không mô tả chúng là feature hoạt động nếu không có extension bundle.

## Không nằm trong bằng chứng hiện tại

- Không có CI/CD workflow trong repo.
- Không có reverse-proxy/TLS config trong repo; production snapshot vẫn dùng HTTP/IP.
- Không có benchmark capacity đáng tin cậy: **CAPACITY NOT YET BENCHMARKED**.
- Không có bằng chứng restore rehearsal cho backup production hiện tại.
