# 04 — Backend

**Entry:** `backend/src/app.ts` → `bootstrap()` → `app.listen({ port, host })` từ `config`.

---

## Layer thực tế `VERIFIED`

Project **không** có folder `controllers/` tách. Pattern:

```text
Fastify route function (*-routes.ts)
  → authMiddleware / requireGrant / requireZaloAccess / requireActiveUser
  → service file cùng module (hoặc logic inline trong route)
  → prisma / zaloPool / redis / storage
  → emit Socket.IO / webhook / BullMQ
```

Ví dụ:

| Module | Routes | Service / infra |
|---|---|---|
| Auth | `auth-routes.ts`, `user-routes.ts` | `auth-service.ts`, `refresh-token-service.ts` |
| Contacts | `contact-routes.ts` | `merge-service.ts`, `contact-scope.ts`, prisma |
| Chat | `chat-routes.ts` | `zaloPool`, `zalo-operations.ts` |
| Zalo | `zalo-routes.ts` + nhiều file | `zalo-pool.ts`, listener factory |
| Telephony | `telephony-routes.ts`, `omicall-public-routes.ts` | `omicall-*.ts` |
| RBAC | `*-routes.ts` trong `rbac/` | `permission-group-service.ts` |

---

## Fastify plugins `VERIFIED` (`app.ts`)

- CORS: production `origin = config.appUrl`, credentials true; dev `origin: true`
- JWT: `@fastify/jwt` secret `config.jwtSecret`
- Rate limit: allowList URL **không** bắt đầu `/api/` (SPA tĩnh không tính)
- Multipart, formbody
- Static `/files/` khi storage local; static SPA `/` từ `/app/static` production
- `trustProxy: true` (Cloudflare/nginx) — comment chống rate-limit gom IP proxy
- Error handler: log + `{ error: message }` status `statusCode ?? 500`
- `/health` — `SELECT 1` Prisma
- `/api/v1/status` — `{ version: '1.0.0', name: 'Zalo CRM' }`

SPA fallback: production, URL không `/api/` → `index.html`.

---

## Socket.IO `VERIFIED`

- `registerSocketAuth(io, app)`
- `registerZaloSocketHandlers(io)`
- `registerChatSocketHandlers(io)`
- `registerPrivacyLeakGuard(app)` (HTTP)

---

## Jobs in-process `VERIFIED` (sau listen)

Chỉ chạy khi `nodeEnv !== 'test'` với một số worker:

| Job | File start |
|---|---|
| Appointment reminder | `appointment-reminder.js` |
| Zalo health check | `zalo-health-check.js` |
| Contact intelligence | `contact-intelligence.js` |
| Labels sync 60s | `zalo-labels-routes.js` |
| Group scan BullMQ worker | `group-scan-queue.js` |
| Interaction cron | `interaction-cron.js` |
| Engagement cron | `engagement-cron.js` |
| Presence cron | `presence-service.js` |
| Friend sync cron ~15m | `friend-sync-cron.js` |
| Group info 6h | `group-info-sync-cron.js` |
| List enrichment | `list-enrichment-service.js` |
| Contact profile sync | `contact-profile-sync-cron.js` |
| Status log checkpoint | `status-log-checkpoint-cron.js` |
| Scoring scheduler | `scoring-scheduler.js` |
| Auto tags aggregate | `contact-autotags-dirty.js` |
| Media trash GC | `media-trash-gc-cron.js` |
| eventBuffer | `event-buffer.js` |
| Telegram bridge | `initTelegramBridge()` |
| EE jobs | `startExtensionJobs` — **no-op Community** |

Boot: reconnect Zalo accounts có `sessionData`, `archivedAt null`, `zaloUid != null`.

Shutdown: SIGTERM/SIGINT → `stopGroupScanWorker` + `app.close`, timeout 10s.

---

## Validation `INFERRED`

Không dùng class-validator toàn cục. Route tự check field + `reply.status(400)`. Prisma throw → error handler 500.

---

## Logging `VERIFIED`

Fastify `logger: false`; dùng `backend/src/shared/utils/logger.js`. Compose log driver json-file rotate 20m × 5.

---

## Error handling `VERIFIED`

`app.setErrorHandler` — không có envelope `{ data, error }` thống nhất ngoài `{ error: string }` (+ đôi khi `code`).

---

## Extension hook `VERIFIED`

```ts
loadExtension() → import('./_ee/index.js') catch → null
registerExtensionEarly / registerExtensionRoutes / startExtensionJobs
```

Lead Pool + Facebook Lead Ads **chỉ** qua EE (comment `app.ts`).

---

## Prisma client `VERIFIED`

`shared/database/prisma-client.ts`: singleton, adapter-pg, extensions derive phone/name, null-byte strip, tenant guard, optional RLS SET LOCAL.
