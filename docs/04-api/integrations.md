# API integration boundary

- Incoming webhook/public route phải có provider-specific verification; OmiCall dùng configured secret/status mapping. Không assume mọi provider ký HMAC.
- Outbound webhook có API key/signature helper và retry/log tùy implementation; xem `docs/08-integrations/README.md` trước khi thay.
- Zalo SDK/Telegram/OmiCall/AI đều là network dependency: timeout, retry, idempotency và data leakage phải review theo caller.
- Public API/webhook settings nằm ở `modules/api`; external integration config ở `modules/integrations` và per-provider modules.
- Facebook/TikTok/Zalo Ads table/config không chứng minh ingestion đang active trong Community vì `_ee` absent.

Không có provider rate-limit authoritative trong repo cho đa số dịch vụ. Khi cần con số, ghi `UNKNOWN` và xác minh tài liệu/provider account hiện hành.
