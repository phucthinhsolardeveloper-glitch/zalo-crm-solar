# 12 — Environment Configuration

**Không paste giá trị secret.** File `.env` gitignored.

Nguồn typed: `backend/src/config/index.ts` + `process.env` rải rác (Firebase, Telegram, FB — một phần **không** nằm hết trong `config` object).

---

## Files `VERIFIED`

| File | Git | Vai trò |
|---|---|---|
| `.env.example` | tracked | Template đầy đủ |
| `backend/.env.example` | tracked (gitignore exception) | Có thể subset |
| `.env` | ignored | Local/Docker `env_file` |
| `.env.production` | ignored (pattern `.env.*`) | Có trên disk workspace — **không đọc nội dung** vào docs |

`.dockerignore` loại `.env` khỏi image — runtime compose **mount env_file từ host**.

---

## Configuration map (nhóm)

### Server & URLs

`PORT` (trong container = 3000), `HOST`, `NODE_ENV`, `APP_PORT` (publish), `APP_URL`, `CRM_LOGIN_URL`.

CORS production dùng `APP_URL`. CSP websocket suy từ `APP_URL` (comment .env.example).

### Secrets bắt buộc production `VERIFIED`

`JWT_SECRET`, `ENCRYPTION_KEY` ≥32, không fallback. `DB_PASSWORD`, `DATABASE_URL` khớp user/pass/host.

Compose: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` required.

### Database

`DB_USER`, `DB_NAME`, `DB_PORT`, `DATABASE_URL`. Compose **ghi đè** URL host=`db`.

### Redis

`REDIS_URL`

### Storage

`STORAGE_DRIVER`, `UPLOAD_DIR`, `LOCAL_PUBLIC_URL`, `S3_*`

### OmiCall

`OMICALL_*`, `CRM_CUSTOM_OMICALL_WEBHOOK_URL`, `CRM_CUSTOM_OMICALL_WEBHOOK_SECRET` (config.ts; **không** nằm block đầu .env.example — thêm tay hoặc đã có ở bản fork).

### AI / Telegram / Ads / Push

Xem `.env.example` (không copy key).  
**Cảnh báo:** `.env.example` từng chứa giá trị `OMICALL_API_KEY` dạng hex dài — **không** dùng example như secret production; rotate nếu key từng leak.

### Security flags

`ACCESS_TOKEN_TTL`, refresh TTLs, `TENANT_GUARD_MODE`, `CSP_MODE`, `SOCKET_REQUIRE_ACCESS_TYP`, `RLS_SET_CONFIG`, `PRIVACY_LOCK_NEW`

### Feature / test

`AUTOMATION_STUB_MODE`, `FRIEND_INVITE_TEST_MODE` (compose default **true**), `MEDIA_AV_*`, `MEDIA_TRASH_GC_DRYRUN`

---

## Ai đọc gì `VERIFIED`

| Biến | Đọc bởi |
|---|---|
| Compose interpolation `APP_PORT`… | Docker Compose |
| `DATABASE_URL` | Prisma client + compose override |
| `config.*` | Backend Node |
| `VITE_BACKEND_URL` | **Chỉ Vite dev** — **không** dùng trong image prod |
| FE production | cùng origin, không cần Vite env |

Đổi `.env` → recreate **app** (và service liên quan). Prisma đã generate trong **image** — đổi DB URL không cần rebuild, cần restart app.

---

## Development vs production `VERIFIED`

| | Dev hybrid | Docker compose |
|---|---|---|
| NODE_ENV | development (tsx) | `production` (compose environment) |
| JWT fallback | cho phép <32 | throw |
| CORS | origin true | `appUrl` |
| Static SPA | Vite | Fastify `/` |
| DATABASE host | localhost:5433 | `db` |

---

## UNKNOWN

Toàn bộ key `process.env` không qua `config/index.ts` (Telegram, FB, Firebase, ClamAV host) — grep khi thêm biến mới.
