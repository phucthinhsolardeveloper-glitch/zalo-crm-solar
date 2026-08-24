# 02 — Tech Stack

Chỉ ghi những gì `package.json`, Dockerfile, compose, schema **xác nhận**.

---

## Runtime & language `VERIFIED`

| Thành phần | Version / ghi chú | Nguồn |
|---|---|---|
| Node | **22** (Docker `node:22-alpine`; runbook Windows cũng khuyến Node 22) | `docker/Dockerfile`, `DOCUMENT-QUY-TRINH-SETUP-RUN.md` |
| TypeScript | Backend `typescript` ^6; frontend `~5.9.3` | package.json |
| Module | `"type": "module"` (ESM) cả hai | package.json |
| Backend start | `tsx watch src/app.ts` (dev), `node dist/app.js` (prod) | backend/package.json, Dockerfile CMD |

---

## Frontend `VERIFIED`

| Lib | Vai trò |
|---|---|
| Vue 3.5 | UI |
| Vite 8 | Bundler; PWA plugin **có trong deps** nhưng `main.ts` comment **tắt** register SW (“vite-plugin-pwa supports vite 8”) |
| Vue Router 4 | SPA history |
| Pinia 3 | Auth / privacy / rbac |
| Vuetify 4 + vite-plugin-vuetify | Components + MDI |
| Axios | REST `/api/v1` |
| socket.io-client | Realtime |
| Chart.js + vue-chartjs | Báo cáo |
| TipTap | Rich text |
| ExcelJS | Export |
| vue-i18n | Có dependency; mức dùng UI **INFERRED** (chưa map hết locale files) |
| lucide-vue-next | Icons |

**Không có:** React, Next.js, Tailwind như stack chính (CSS tokens + Vuetify).

---

## Backend `VERIFIED`

| Lib | Vai trò |
|---|---|
| Fastify 5 | HTTP |
| `@fastify/jwt`, cookie, cors, multipart, formbody, rate-limit, static | Plugins trong `app.ts` |
| Socket.IO 4 | Cùng process HTTP |
| Prisma 7 + `@prisma/adapter-pg` + `pg` | ORM (Prisma 7 **bắt buộc** adapter) |
| bcryptjs | Password hash (cost 12 setup/login, 10 một số user-routes) |
| jsonwebtoken | Có dep; Fastify JWT là đường chính `VERIFIED` |
| ioredis + bullmq | Queue (group-scan, lists, EE workers nếu có) |
| zca-js ^2.1.2 | Zalo unofficial SDK |
| telegram (GramJS) | Telegram provisioner |
| @aws-sdk/client-s3 | R2/S3 |
| sharp + ffmpeg (apk) | Ảnh/video |
| exceljs, mammoth, pdf-parse | Import/parse AI docs |
| firebase-admin | Push (env path JSON) |
| node-cron | Scheduler |
| @bull-board/* | UI queue (nếu mount — `INFERRED` khi import) |
| uuid, image-size | Utilities |

**Không có:** NestJS, TypeORM, Sequelize, Express (trừ Fastify).

---

## Data & infra `VERIFIED`

| | |
|---|---|
| PostgreSQL | Image `postgres:16-alpine`; timezone **UTC** cho data, log `Asia/Ho_Chi_Minh` |
| Redis | `redis:7-alpine`, AOF everysec, maxmemory 256mb, policy **noeviction** |
| MinIO | `minio/minio:latest` + `minio/mc` init bucket |
| ClamAV | `clamav/clamav:1.4`, app **không** `depends_on` clamav |
| Backup | `prodrigestivill/postgres-backup-local`, schedule `@daily`, mount `./backups` |

---

## Database access pattern `VERIFIED`

- `DATABASE_URL` bắt buộc khi tạo Prisma client.
- Extension Prisma: auto `phoneNormalized`, `fullNameNoAccent`/`crmNameNoAccent`; strip `\u0000`; tenant-guard optional.
- Migrations: `backend/prisma/migrations/` — **114** folders. Prod: `npx prisma migrate deploy` **trong container app** (script deploy), **không** chạy lúc `CMD` container (comment Dockerfile 2026-06-02).

---

## Edition flags `VERIFIED`

| | Community (repo này) | Extension |
|---|---|---|
| Backend `_ee` | Absent | `import('./_ee/index.js')` |
| Frontend `@ee` | `_ee-stubs` | `src/_ee` nếu tồn tại |

---

## Testing `VERIFIED`

- Backend: Vitest (`vitest run`).
- Frontend: Vitest + jsdom + vue-test-utils.

---

## UNKNOWN

- Production reverse proxy cụ thể trên VPS Phúc Thịnh (nginx vs Caddy vs Cloudflare) — **không** có file Caddyfile/nginx trong root scan.
- Firebase project ID thật — chỉ path env, không commit `secrets/`.
