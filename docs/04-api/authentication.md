# API authentication

## Login/session lifecycle

1. Setup/login xác thực credential và cấp access JWT `typ=access` cùng refresh token opaque.
2. Frontend gửi Bearer access token.
3. `authMiddleware` verify JWT, tạo `authCtx` với user/org/role.
4. Refresh token được hash trong DB, single-use rotation theo family; reuse ngoài grace revoke family.
5. Logout revoke family. Password/reset tăng `jwtTokenVersion`; access token ngắn có revocation window tối đa TTL, sensitive admin route dùng `requireActiveUser`.

Defaults: access `15m`, refresh `30d`, family max `90d`, grace `20s`.

## Authorization

Backend dùng kết hợp legacy role, permission grant, department/owner/contact/Zalo scope. Route protection không đồng đều tuyệt đối; feature mới phải khai báo middleware rõ ràng và test negative path. Telephony hiện chưa có grant resource riêng.

Frontend router/store guard chỉ là UX, không phải security control.

## Realtime

Socket.IO verify JWT và join room organization. `SOCKET_REQUIRE_ACCESS_TYP` rollout state cần kiểm env trước khi thay; không copy legacy 7-day token assumption.
