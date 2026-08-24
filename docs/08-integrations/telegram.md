# Telegram bridge

Bridge ánh xạ Zalo thread sang Telegram topic để hỗ trợ vận hành hội thoại. Core dùng Telegram Bot API; source còn có MTProto provisioner. Mapping được lưu DB, do đó topic/thread identity và lifecycle phải được giữ ổn định qua restart.

## Luồng

Inbound Zalo event được chuyển thành message/topic phù hợp; command/reply Telegram được map về Zalo thread và gửi qua account tương ứng. Media cần chuyển đổi URL/file/MIME trong giới hạn của cả hai provider. Missing token/config phải làm integration degrade/disable rõ, không làm core chat chết.

## Rủi ro cần xử lý

- duplicate loop khi message forward quay lại nguồn;
- topic bị xóa/đổi quyền hoặc mapping stale;
- Bot API/MTProto rate limit, timeout và flood wait;
- file quá lớn/URL hết hạn;
- lộ nội dung khách hàng sang group/topic sai;
- retry không idempotent tạo message trùng.

Exact retry/backoff, quota và production credential state là `NEEDS VERIFICATION`. Test tối thiểu gồm text/media/reply, duplicate, deleted topic, 401/403/429, restart mapping recovery và authorization của group/operator.
