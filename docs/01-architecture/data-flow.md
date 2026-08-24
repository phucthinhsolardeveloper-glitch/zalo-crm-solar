# Data flow

## CRM và Zalo

`ZaloAccount` giữ session và owner. Event/sync tạo hoặc cập nhật `Friend`, `Conversation`, `Message`; resolver liên kết identity/phone với `Contact`. Contact là hồ sơ CRM tổng hợp, Friend là trạng thái theo từng nick.

## Media

Upload → multipart/per-kind validation → ClamAV khi bật → `MediaBlob/MediaAsset` metadata → storage driver. Namespace media có thể public để Zalo CDN tải; namespace `recordings/` bị chặn khỏi static route và chứa ciphertext.

## Telephony

Call event/history → normalize number/status → upsert `TelephonyCall` trong org/owner scope → resolve Contact/Conversation theo phone → optional download recording → AES-256-GCM → storage reference → playback route auth giải mã server-side.

## Jobs

Cron/worker trong process app đọc PostgreSQL/Redis, xử lý batch và ghi lại DB; graceful shutdown hiện chỉ đóng group-scan worker và Fastify rõ ràng. Việc drain toàn bộ job loại khác là `NEEDS VERIFICATION`.
