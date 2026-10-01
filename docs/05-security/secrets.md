# Secrets

Secret chỉ tồn tại trong environment/secret manager, không trong Git, Markdown, log hoặc screenshot. Root `.env`/`.env.production` không được track; templates chỉ dùng placeholder.

Nhóm secret: JWT/encryption, DB/Redis/MinIO/S3, OmiCall, AI tokens, Telegram, Ads/OA, Firebase. `ENCRYPTION_KEY` bảo vệ các secret dùng chung; Zalo session có thể tách bằng `ZALO_SESSION_ENCRYPTION_KEY`. Không đổi khóa tùy ý: dùng `ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS` + `npm run db:rotate-zalo-sessions` (dry-run trước, `--apply` sau khi backup).

Legacy archive đã redaction mọi assignment credential phát hiện; `STEP-3-CHECKLIST.md` được đánh dấu `SECURITY_REDACTED`. Nếu một secret từng xuất hiện trong file/chat, coi là exposed và rotate ở provider/runtime.

Production cần vault hoặc file permission chặt, backup secret tách biệt và audit quyền truy cập. Trạng thái vault/rotation policy hiện là `UNKNOWN`.
