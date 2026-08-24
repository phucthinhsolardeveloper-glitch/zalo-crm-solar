# Glossary

- **Organization / org / tenant**: biên dữ liệu cao nhất; phần lớn entity có `orgId`.
- **User**: tài khoản CRM; legacy `role` cùng tồn tại với `permissionGroupId`.
- **ZaloAccount / nick**: tài khoản Zalo cá nhân gắn owner; có session/reconnect/privacy mode.
- **Contact**: hồ sơ khách hàng CRM, có thể tổng hợp từ nhiều identity/nick.
- **Friend**: quan hệ `(ZaloAccount × identity)` và trạng thái bạn bè theo nick.
- **Conversation / Message**: hội thoại và tin nhắn đồng bộ/gửi qua Zalo.
- **PermissionGroup / Department**: matrix grant và scope tổ chức.
- **TelephonyCall / CallNote**: CDR và ghi chú cuộc gọi; note ngoài gộp theo `phoneKey`.
- **Community / `_ee`**: core công khai và extension bundle tùy chọn; `_ee` vắng mặt trong repo hiện tại.
- **Canonical docs**: tài liệu dưới `docs/` hiện tại; legacy archive không phải source of truth.
