# Environment

Canonical template là root `.env.example`; `backend/.env.example` là subset development và hiện có một số tên AI key khác root, nên ưu tiên root khi chạy compose.

## Bắt buộc production

- `JWT_SECRET`, `ENCRYPTION_KEY`: tối thiểu 32 ký tự, khác dev fallback; config fail-fast. `ZALO_SESSION_ENCRYPTION_KEY` tùy chọn, mặc định fallback về `ENCRYPTION_KEY`; xoay riêng Zalo dùng `ZALO_SESSION_ENCRYPTION_KEY_PREVIOUS`.
- `DB_PASSWORD`, `DATABASE_URL`/`DB_*`.
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` vì compose hard-fail; S3 key/bucket nếu dùng MinIO/R2.
- `APP_URL`: origin CORS/Socket.IO/CSP và public link; production phải là HTTPS thực.

## Nhóm cấu hình

- Server: `PORT`, `HOST`, `NODE_ENV`, `APP_URL`, host port variables.
- Data: `DATABASE_URL`, `REDIS_URL`, `UPLOAD_DIR`.
- Storage/AV: `STORAGE_DRIVER`, `S3_*`, `MEDIA_AV_*`, `CLAMAV_*`.
- Telephony: `OMICALL_*` và optional CRM forward webhook.
- AI: provider/model/base URL/auth token.
- Integrations: Telegram, Facebook/TikTok/Zalo OA, Firebase.
- Security: token TTL, tenant guard, CSP, Socket access type, RLS set-config.

## Defaults đáng chú ý

- access token 15 phút; refresh 30 ngày; family cap 90 ngày; reuse grace 20 giây.
- API rate limit 1200/phút/user.
- `TENANT_GUARD_MODE=off`, `CSP_MODE=report-only`, `RLS_SET_CONFIG=false` nếu không set.
- `STORAGE_DRIVER=local` nếu không set.

Không ghi giá trị `.env` thật vào docs. `.env` và `.env.production` không được Git track tại thời điểm kiểm tra.
