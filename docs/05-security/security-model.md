# Security model

ZCRM Solar dùng nhiều lớp: TLS/reverse proxy (chưa có config trong repo), Fastify CORS/JWT/rate limit/headers, backend auth/grant/scope, tenant context, Prisma constraints, storage namespace và audit log.

## Control đã có

- Production fail-fast nếu JWT/encryption key yếu hoặc thiếu.
- Access JWT ngắn + refresh rotation/reuse detection; Socket.IO verify token.
- CORS production theo `APP_URL`; rate limit 1200 API request/phút/user.
- AES-GCM cho SIP secret và recording; refresh token/API secret lưu hash khi implementation quy định.
- File upload có type/size path, SSRF guard và ClamAV hooks; runtime AV bật fail-closed.
- Recording không được serve qua `/files`; playback cần backend auth.
- Logger/audit có redaction ở các luồng đã review.

## Control chưa enforce

- Production đang HTTP/IP; transport confidentiality chưa đạt.
- CSP `report-only`; tenant guard `off`; RLS chưa apply/set-config.
- Telephony chưa có resource RBAC riêng.
- MinIO S3 API public và bucket media cho anonymous download theo design; random key không thay access control cho dữ liệu nhạy cảm.
- Không có CI security scan/dependency scan trong repo.

Không suy ra mọi route đều an toàn chỉ vì middleware tồn tại; review route-by-route và test negative/cross-org.
