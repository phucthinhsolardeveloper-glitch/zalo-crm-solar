# 01 — Repository Structure

Scan thư mục gốc `zalo-crm-solar`. Không liệt kê `node_modules` / `dist`.

Mỗi mục: **mục đích → ai dùng → module liên quan → ảnh hưởng**.

---

## Root

| Path | Mục đích | Ai dùng | Module | Ảnh hưởng |
|---|---|---|---|---|
| `backend/` | API Fastify, Prisma, tests, workers in-process | Runtime app, developer | Toàn bộ backend | API, DB, Zalo, jobs |
| `frontend/` | Vue SPA | Vite/Docker builder | UI | Mọi màn hình |
| `docker/Dockerfile` | Multi-stage: FE build + BE build + image Node 22 alpine | `docker compose build` | Deploy | Image `app` |
| `docker-compose.yml` | Stack prod: app, db, redis, minio, minio-init, backup, clamav | Ops / local Docker | Infra | Runtime |
| `docker-compose.dev.yml` | **Chỉ Postgres** `zalo-crm-db-dev` port 5433 | Dev BE `npm run dev` | Local DB | Schema local |
| `.env.example` | Template biến môi trường | Người cài | Config | Mọi service |
| `.env` / `.env.production` | Secrets local — **gitignored** | Runtime | Config | Không document giá trị |
| `scripts/` | install/deploy/backup/restore | Ops | Deploy | Cài mới / nâng cấp |
| `bin/dev-setup`, `bin/dev-teardown` | Helper local | Dev | Local | UNKNOWN nội dung chi tiết (chưa đọc byte-by-byte) |
| `docs/` | Hướng dẫn + architecture | Người | Docs | Không chạy |
| `assets/` | Marketing/post | Docs | Không runtime | |
| `backups/` | Dump Postgres (compose backup mount `./backups`) | Ops | DB | gitignored |
| `README.md` | Product + cài đặt | Người | — | |
| `DOCUMENT-QUY-TRINH-SETUP-RUN.md` | Runbook Windows+Docker đã chạy thật | Người | Local/Docker | |
| `HUONG-DAN-CAI-DAT.md` | Cài đặt tiếng Việt | Người | — | |
| `CHANGELOG.md` | Lịch sử phiên bản | Người | — | |
| `CONTRIBUTING.md`, `LICENSE`, `DCO`, `SECURITY.md` | Pháp lý / contrib | Người | — | |
| `.dockerignore` | Loại file khỏi build context | Docker | Image size | |
| `.gitignore` | Không commit secrets, dist, backups | Git | — | |

---

## Backend

```text
backend/
├── prisma/
│   ├── schema.prisma          → nguồn sự thật schema (112 model)
│   ├── migrations/            → 114 thư mục migration (Prisma migrate)
│   ├── rls/                   → SQL RLS tenant (opt-in env)
│   └── seeds/                 → seed (script prisma seed trỏ prisma/seed.ts — file seed.ts không thấy ở list prisma/; INFERRED có thể nằm scripts)
├── src/
│   ├── app.ts                 → entry: plugins, routes, Socket.IO, crons
│   ├── config/index.ts        → typed env
│   ├── modules/               → 27 bounded contexts
│   └── shared/                → prisma, redis, storage, security, realtime, tenant
├── tests/                     → Vitest (omicall-*, chat, friend, security, …)
├── package.json
└── prisma.config.ts           → copy vào image production
```

### `backend/src/modules/` `VERIFIED`

| Folder | Mục đích | Ảnh hưởng |
|---|---|---|
| `auth` | Login, JWT, refresh, users, org, teams, preferences | Mọi API protected |
| `rbac` | Department, permission-group, grants | Menu + 403 |
| `privacy` | OTP unlock nick private, redact | Chat/contact visibility |
| `zalo` | Pool SDK, QR, friends, groups, labels, sync, health | Kênh Zalo |
| `chat` | Conversations, messages, folders, presets, attachments, ops | Inbox |
| `contacts` | Contact CRUD, appointments, notes, CRM tags, cockpit, merge | CRM KH |
| `telephony` | OmiCall SIP config, webhook, history, recording | Gọi điện |
| `tags` | Tag taxonomy v2 + friend/contact tags | Gắn thẻ |
| `scoring` | Lead score, stuck leads | Pipeline |
| `engagement` | Heatmap / cron | Báo cáo |
| `ai` | Suggest, summarize, chatbot RAG | AI |
| `media` | Kho media, trash GC | File CRM |
| `integrations` | Integration CRUD + Telegram bridge | Bên thứ 3 |
| `api` | Public API key + webhook settings | Tích hợp ngoài |
| `analytics` / `dashboard` | KPI, reports | Dashboard |
| `notifications` / `system-notifications` | Bell + Zalo internal notify | Thông báo |
| `search` | Search toàn hệ | Ô tìm |
| `lists` | Customer lists (Community) | Marketing CE |
| `devices` / `push` | Mobile device + FCM | App mobile |
| `branding` | Org login branding | /login |
| `activity` | Timeline / audit | Nhật ký |
| `campaign` | Campaign (nếu routes mount) | UNKNOWN mức độ dùng Community |
| `config` | App config routes | Settings |

### `backend/src/shared/` `VERIFIED`

`database` (Prisma + tenant transaction), `realtime`, `security`, `storage`, `queue`, `crypto`, `tenant`, `redis-client.ts`, `event-buffer.ts`, `zalo-operations.ts`, `ee-registry` (hooks no-op khi không có EE).

---

## Frontend

```text
frontend/src/
├── main.ts, App.vue
├── router/index.ts          → routes + auth/RBAC guard
├── api/index.ts             → axios + refresh single-flight
├── api/socket.ts, media.ts, public-branding.ts
├── stores/                  → auth, privacy, rbac
├── composables/             → use-chat, use-contacts, use-omicall-softphone, …
├── views/                   → pages
├── components/              → chat, telephony, rbac, settings, …
├── layouts/                 → DefaultLayout (gắn TelephonySoftphone), AuthLayout
├── plugins/vuetify.ts
└── _ee-stubs/               → routes/nav rỗng Community
```

**Ai dùng:** trình duyệt. **Ảnh hưởng:** mọi UX.

---

## Scripts & Docker

| Path | Mục đích | Ảnh hưởng |
|---|---|---|
| `scripts/zalocrm-deploy.sh` | install/upgrade: compose up --build, `prisma migrate deploy`, bump `jwt_token_version` | Production Community |
| `scripts/install.sh` / `install.ps1` | Bootstrap máy + clone + deploy | Cài mới |
| `scripts/backup-postgres.sh` / `.ps1` | Backup tay | DB |
| `scripts/restore-postgres-test.sh` | Test restore | DB |
| `scripts/migrate-storage-*.sh` | Đổi storage URL / rclone | Media |
| `docker/Dockerfile` | Image; **CMD `node dist/app.js`**; **không** auto-migrate lúc start | Deploy |

---

## Tests `VERIFIED`

`backend/tests/` rất nhiều file unit/regression (friend, ghost nick, omicall, media, sequences…). `frontend` có vitest (`package.json` `test`). Không thấy CI GitHub trong repo này.

---

## Docs hiện có (không xóa)

Giữ và đối chiếu:

- `docs/architecture/README.md` + PNG/mmd (cũ 2026-06-16)
- `docs/zalocrm-api/api-documentation*.md`
- `docs/HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md`
- `docs/HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md`, `HUONG-DAN-CAU-HINH-CLOUDFLARE-R2.md`
- Specs OmiCall dưới `docs/superpowers/`
- Root `DOCUMENT-QUY-TRINH-SETUP-RUN.md`

Bộ numbered file này **bổ sung** reverse-engineering 2026-08-20, không thay thế runbook cài đặt.
