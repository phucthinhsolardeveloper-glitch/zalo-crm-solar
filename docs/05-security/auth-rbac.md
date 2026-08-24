# Auth và RBAC

## Identity/session

Login bằng email hoặc số điện thoại. Backend trả access + refresh; frontend giữ session theo implementation hiện tại. Access mặc định 15 phút, refresh 30 ngày, rotation theo family và reuse detection. Password hash dùng bcryptjs.

## Authorization layers

- legacy role: `owner/admin/member` và `requireRole`;
- `PermissionGroup.grants`: resource × action, default deny; owner có fallback bypass trong service hiện tại;
- Department/contact/Zalo account ownership/access scope;
- privacy OTP/session cho nick main;
- organization context trong request/socket.

`RESOURCES` hiện có 18 mục nhưng không có `telephony`. Vì vậy call UI/history/recording chỉ dựa auth/active-user và query ownership/role cụ thể, không cấu hình độc lập qua matrix.

## Quy tắc thay đổi

Mọi endpoint mới phải xác định: public hay auth; resource/action; org scope; owner/dept scope; active-user sensitivity; audit event. Test ít nhất anonymous 401, thiếu grant 403, cross-org không thấy/sửa được và happy path.
