# Zalo/ZCA integration

## Ownership và dữ liệu

ZCRM dùng `zca-js` để kết nối tài khoản cá nhân qua QR/session, duy trì listener/reconnect và thực hiện chat/friend/contact actions. Session và trạng thái account được lưu trong DB; Conversation/Message/Friend/Contact là representation nội bộ, không thay thế provider truth tuyệt đối.

## Lifecycle

1. API tạo QR/login flow cho user có quyền.
2. Sau xác thực, session được lưu theo cơ chế của module và listener được khởi tạo.
3. Event inbound được normalize, deduplicate/persist rồi phát realtime cho UI.
4. Outbound command gọi provider, ghi kết quả/trạng thái và để history/resync sửa divergence nếu có.
5. Reconnect xử lý process restart/network/session expiry; manual disconnect được đánh dấu để không tự kết nối lại ngoài ý muốn.

Không log QR payload, session token, cookie hoặc nội dung chat dư thừa. Access phải giữ org/account assignment và media permission.

## Failure modes

- QR hết hạn hoặc user hủy;
- session invalid/expired, account bị provider hạn chế;
- duplicate/out-of-order event khi reconnect;
- provider 429/network timeout nhưng UI đã optimistic update;
- listener chết âm thầm hoặc realtime mất kết nối;
- media URL/MIME/size không đáp ứng provider.

Provider rate limit, SLA, lịch sử có thể fetch và retention là `UNKNOWN`; cần đo/đối chiếu tài khoản thực trước khi đặt SLO.

## Verification

Test QR success/timeout/cancel, restart reconnect, manual disconnect, inbound/outbound text, media/reaction, friend/contact update, duplicate event, 429/timeout, history resync và cross-org/account denial. Production smoke phải dùng tài khoản test và tránh gửi nội dung thật ngoài ý muốn.
