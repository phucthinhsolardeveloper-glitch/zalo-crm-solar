# CRM và Zalo

## Phạm vi sở hữu

ZCRM Solar là hệ thống vận hành kênh giao tiếp: tài khoản/session Zalo, realtime listener, Friend theo từng nick, Conversation/Message, Contact tổng hợp và workflow chăm sóc gắn hội thoại. `crm-custom` là sổ cái nghiệp vụ riêng cho Lead, Customer, Order và Payment. Hai repo có thể trao đổi sự kiện nhưng không được cùng sở hữu một business rule hoặc bảng master tương đương.

Alias “zalo-crm-custom” xuất hiện trong yêu cầu được hiểu là directory thực `zalo-crm-solar`; không phát hiện codebase thứ ba cùng tên.

## Luồng chính

1. Người dùng kết nối tài khoản Zalo bằng QR/session flow.
2. Listener/reconnect nhận event; dữ liệu được chuẩn hóa vào Conversation/Message/Friend và contact aggregation.
3. Frontend dùng REST và realtime channel để tải danh sách, lịch sử và cập nhật mới.
4. Agent gửi text/media/reaction hoặc thao tác friend/contact qua owner module tương ứng.
5. Automation, bot hoặc integration chỉ chạy khi config/feature flag cho phép; trạng thái production của từng nhánh phải kiểm lại.

Contact là góc nhìn tổng hợp để tìm kiếm/chăm sóc, không chứng minh đồng nhất với Customer trong `crm-custom`. Khi liên kết hai hệ, dùng stable external identity, phone đã normalize và event ID/call UUID; mapping phải có idempotency, audit và chiến lược xử lý conflict. Chưa có master-data synchronization hai chiều đầy đủ được xác minh.

## Tính đúng và quyền

Mọi query/write phải giữ org scope, account ownership/assignment và role/permission theo policy hiện tại. Với chat, cần test anonymous, không quyền, đúng org, cross-org, account không được gán và media access. Tenant guard/RLS đang tắt ở production snapshot 2026-08-24, nên service/query scope và regression test là lớp bảo vệ quan trọng; đây vẫn là readiness gap.

## Failure modes và verification

- Session hết hạn, QR timeout, manual disconnect và auto reconnect phải được phân biệt.
- Duplicate/out-of-order message, provider rate limit và media upload failure không được tạo dữ liệu lặp hoặc UI “thành công giả”.
- Realtime disconnect phải có resync/history path; exact provider retention/rate limit là `UNKNOWN`.
- Smoke tối thiểu: connect/disconnect, receive/send text, media, friend/contact update, reload history, cross-org denial và reconnect sau restart.

Xem thêm `docs/08-integrations/zalo.md`, `docs/01-architecture/request-flow.md` và `docs/03-data/data-model.md`.
