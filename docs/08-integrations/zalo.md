# Zalo/ZCA integration

Hướng vận hành và các tranche triển khai theo nghiệp vụ công ty nằm tại [mô hình vận hành Zalo an toàn](../09-decisions/20260929-zalo-safe-operating-model.md). File này giữ chi tiết kỹ thuật provider/session; không tự định nghĩa thêm policy gửi hàng loạt.

## Ownership và dữ liệu

ZCRM dùng `zca-js` để kết nối tài khoản cá nhân qua QR/session, duy trì listener/reconnect và thực hiện chat/friend/contact actions. Session và trạng thái account được lưu trong DB; Conversation/Message/Friend/Contact là representation nội bộ, không thay thế provider truth tuyệt đối.

## Lifecycle

1. API tạo QR/login flow cho user có quyền.
2. Sau xác thực, session được mã hóa at-rest bằng AES-256-GCM (`zalo-session-encrypted-v1`) rồi listener được khởi tạo; legacy raw session chỉ được đọc để migrate.
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

## Hạn chế đã biết (nền tảng Zalo, ngoài tầm kiểm soát của ZCRM)

**1 session "Web-class" mỗi tài khoản.** `zca-js` là API không chính thống, hoạt động bằng cách giả lập Zalo Web (`backend/node_modules/zca-js/README.md:113`: "Only one web listener can run per account at a time. If you open Zalo in the browser while the listener is active, the listener will be automatically stopped."). Zalo (phía server) chỉ cho 1 phiên Web-class hoạt động/tài khoản — đăng nhập Zalo Web hoặc Desktop bằng tài khoản đang gắn ZCRM sẽ tự đá session của ZCRM (và ngược lại). Zalo Mobile app thường không bị ảnh hưởng (khác nhóm thiết bị).

- **Xác nhận trong code:** `zalo-pool.ts:487-505` (`onDisconnected`) chỉ phản ứng thụ động — đánh dấu `disconnectReason: 'passive'`, thử reconnect; không có cơ chế chủ động giữ/giành session vì đây là hành vi phía server Zalo.
- **Quy tắc vận hành bắt buộc:** tài khoản Zalo đã gắn ZCRM **không được** đăng nhập song song trên Zalo Web/Desktop bởi người dùng. Vi phạm → mất kết nối CRM, phải quét QR lại.

**Rủi ro khoá tài khoản do dùng API không chính thống.** `zca-js` giả lập client, không phải API Zalo cấp phép chính thức — tài khoản có thể bị Zalo tạm khoá/hạn chế nếu bị phát hiện gửi tin bất thường (tốc độ cao, gửi hàng loạt giống spam...). Hiện trạng phòng ngừa trong code, đã xác minh:
- **Có:** proxy riêng theo từng account khi login/reconnect (`zalo-pool.ts:208,376`, field `proxyUrl`) — tách IP giữa các account.
- **Có:** retry với backoff cho lỗi mạng tạm thời (`shared/zalo-operations.ts:242-244`, `424-436`).
- **Có guardrail nội bộ:** outbound reservation atomic theo nick + loại thao tác; Redis lỗi thì chat 1-1 chuyển sang limiter in-process bảo thủ, còn queue/bulk phải pause. Reservation lỗi provider chắc chắn được hoàn; timeout mạng giữ reservation vì trạng thái giao tin không chắc chắn. Đây không phải quota chính thức của Zalo và chưa phải giấy phép broadcast/personal bulk.
- **Không có / `UNKNOWN`:** quota/SLA thật của Zalo cá nhân và khả năng tài khoản bị flag vẫn chưa biết; campaign/broadcast cá nhân vẫn bị cấm theo policy nội bộ.
- Không có cơ chế theo dõi/cảnh báo sớm khi account bị Zalo hạn chế (ngoài log lỗi khi gọi API thất bại).

Quyết định vận hành và phương án chuyển các luồng chiến dịch sang OA được ghi tại [mô hình vận hành Zalo an toàn](../09-decisions/20260929-zalo-safe-operating-model.md). Đây mới là định hướng nội bộ; OA provider, quota và quyền thực tế của công ty vẫn phải được xác minh trước khi triển khai.

## Trạng thái broadcast trong bản Community

- Prisma có model `AutomationBroadcast` và RBAC có resource `broadcast`, nhưng đó chưa phải một luồng gửi hoạt động.
- Route và worker automation/marketing được đăng ký qua extension bundle; khi không có bundle, registry Community là no-op.
- Chưa có OA identity/provider, queue OA hay worker gửi chiến dịch được xác minh trong bản Community hiện tại.
- Vì vậy không được coi model `AutomationBroadcast` (đang có default channel `zalo_user`) là khả năng gửi hàng loạt. Không bật hoặc nối model này vào Zalo cá nhân.

## Verification

Test QR success/timeout/cancel, restart reconnect, manual disconnect, inbound/outbound text, media/reaction, friend/contact update, duplicate event, 429/timeout, history resync và cross-org/account denial. Production smoke phải dùng tài khoản test và tránh gửi nội dung thật ngoài ý muốn.
