# 16 — Troubleshooting Map

Chỉ vấn đề khớp stack này.

| Problem | Có thể nằm ở đâu | Kiểm tra gì | Command / File |
|---|---|---|---|
| FE không gọi được API (Vite) | Proxy, backend down, CORS | Network tab `/api/v1`; backend :3000 | `frontend/vite.config.ts`; `VITE_BACKEND_URL` |
| FE không gọi được API (Docker) | App crash, sai APP_PORT, SPA fallback | `GET /health`, `GET /api/v1/status` | `docker logs zalo-crm-app`; compose ports |
| Backend không kết nối DB | `DATABASE_URL`, db chưa healthy, password lệch | Log Prisma; `pg_isready` | compose `DATABASE_URL` host **`db`** không `localhost` trong container |
| Prisma migrate lỗi | Migration drift, DB push lẫn migrate | `prisma migrate status` | `docker exec zalo-crm-app npx prisma migrate deploy` |
| Docker không thấy code mới | Không mount source | Image cũ | `docker compose up -d --build` |
| Container crash loop | JWT/ENCRYPTION prod thiếu, migrate, sharp/vips | logs | `config/index.ts` fail-fast; Dockerfile vips |
| Port conflict | 3080/5433/6379/9000 | `netstat` / deploy `ensure_ports` | `.env` APP_PORT |
| Env sai / không apply | restart không recreate | biến trong container | `docker exec zalo-crm-app printenv \| findstr OMICALL` (không log secret ra chat) |
| Auth 401 vòng login | Refresh reuse đa tab, RT hết hạn | `refresh_reuse`; localStorage | `api/index.ts` single-flight; `REFRESH_GRACE_MS` |
| 403 RBAC | grant / role | `canAccess` vs `requireGrant` | permission-group |
| Setup bị chặn | đã có user | `/setup/status` | User count |
| Zalo không reconnect | sessionData, archived, manual disconnect | account status | `zalo-pool`, `disconnectReason` |
| Chat không realtime | socket auth, token typ | socket.io 401 | `socket-auth.ts`, `SOCKET_REQUIRE_ACCESS_TYP` |
| Upload 500 | sharp/vips, disk volume, ClamAV fail-closed | logs upload | Dockerfile vips; `file_storage` |
| Ảnh Zalo không hiện | STORAGE_DRIVER, APP_URL HTTP, MinIO anonymous | URL attachment | `localPublicUrl` / `S3_PUBLIC_URL` HTTPS |
| OmiCall 503 “chưa gán extension” | User.omicallExtension null | Settings Users | `connect-config`; toast skipErrorToast |
| OmiCall không kết nối SIP | ENABLED/DOMAIN/WSS, mật khẩu, HTTPS mixed content | Browser console WSS | `.env` OMICALL_*; connect-config |
| Webhook OmiCall không vào | secret query, proxy body, URL public | 404/401 events | `omicall-public-routes.ts` `?key=` |
| Sync history trống | API key/base URL staging vs prod | logs history-sync | `OMICALL_API_*`; `omicall-history-sync.ts` |
| Relay crm-custom không tới | URL/secret trống | config | `omicall-crm-forward.ts` |
| Redis/BullMQ job mất | `down -v`, maxmemory | redis volume | compose redis noeviction |
| Rate limit 429 hàng loạt | trustProxy tắt, IP proxy | Fastify | `app.ts` trustProxy comment |
| ClamAV chậm boot | start_period 300s | health | không chặn app |
| Community thiếu Lead Pool | không có `_ee` | log boot | `app.ts` Community edition |
| origin/main thiếu OmiCall sync | git | `4b123cb` vs `11196b2` | `14-GIT-BRANCHES.md` |

---

## Health commands `VERIFIED`

```text
docker compose ps
docker logs zalo-crm-app --tail 200
curl http://localhost:3080/health
curl http://localhost:3080/api/v1/status
```
