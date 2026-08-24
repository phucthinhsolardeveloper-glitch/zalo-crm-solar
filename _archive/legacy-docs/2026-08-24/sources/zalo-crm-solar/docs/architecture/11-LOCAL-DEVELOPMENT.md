# 11 — Local Development

Hai cách **đã có trong repo**. Source of truth: compose files + `DOCUMENT-QUY-TRINH-SETUP-RUN.md` + `frontend/vite.config.ts`.

---

## Cách A — Full Docker (giống prod) `VERIFIED`

```text
cp .env.example .env   # điền secret, APP_URL=http://localhost:3080
docker compose up -d --build
docker exec zalo-crm-app npx prisma migrate deploy
# browser http://localhost:3080  (APP_PORT)
```

- FE+BE **đã compile** trong image.
- Sửa `.ts`/`.vue` trên Windows → **container không thấy** → cần `--build`.
- DB/Redis/MinIO persist volume.

Runbook Windows: `DOCUMENT-QUY-TRINH-SETUP-RUN.md`.

---

## Cách B — Hybrid `VERIFIED`

```text
docker compose -f docker-compose.dev.yml up -d    # chỉ Postgres :5433
cd backend && npm i && set DATABASE_URL=postgresql://crmuser:devpassword@localhost:5433/zalocrm
npx prisma migrate dev
npm run dev     # tsx watch :3000  (PORT)
cd frontend && npm i && npm run dev   # Vite :5173 proxy → :3000
```

- Backend **hot reload** `tsx watch`.
- Frontend HMR Vite.
- Redis/MinIO **không** có trong dev compose → tính năng queue/S3 **INFERRED** cần Redis local hoặc tắt.

---

## Khi sửa source (Docker Cách A)

| Thay đổi | Container thấy ngay? | Restart? | Rebuild? |
|---|---|---|---|
| `frontend/src`, `backend/src` | **Không** (không volume source) | Không đủ | **Có** `docker compose up -d --build app` |
| Chỉ env `.env` | Sau recreate | `up -d` / restart app | Không (trừ Dockerfile ARG — không dùng ARG cho app env) |
| `package.json` lock | Không | Không | **Có** (npm install trong image) |
| Dockerfile | Không | Không | **Có** `--build --no-cache` nếu layer cache sai |
| Prisma schema | Không đổi DB cho đến migrate | App cần binary mới nếu client generate | **Rebuild** + `migrate deploy` |

---

## Khi sửa schema

Migration nằm `backend/prisma/migrations/`.

```text
# hybrid
cd backend && npx prisma migrate dev

# docker
docker exec zalo-crm-app npx prisma migrate deploy
```

`db:push` tồn tại — **không** dùng prod (mất cột — comment Dockerfile).

---

## `docker compose restart` `VERIFIED`

Restart process container **cùng image**, **giữ volume**. App load lại env **nếu** compose inject; `.env` đã load lúc `up` — đổi `.env` rồi **chỉ restart** có thể **không** reload env_file trên mọi Docker version → an toàn hơn `docker compose up -d` recreate.

App mất kết nối Zalo in-memory → **reconnect** từ `sessionData` lúc boot `app.ts`.

Redis/DB không mất data.

---

## `docker compose down` `VERIFIED`

Dừng + xóa container. **Giữ named volumes** (`pg_data`, …). Bind `./backups` giữ.

---

## `docker compose down -v` `VERIFIED`

Xóa named volumes → **mất Postgres, Redis, MinIO, file_storage, clamav_data**. Deploy script **cố ý không** dùng `-v`.

---

## Rebuild image vs database `VERIFIED`

Rebuild **không** xóa `pg_data`. Schema DB chỉ đổi khi chạy migration (hoặc xóa volume).

---

## Bảng tóm tắt

| Thay đổi | Restart? | Rebuild? | Migration? | Database impact? |
|---|---|---|---|---|
| Vue/TS source (Docker A) | Không đủ | **Có** | Không | Không |
| Vue/TS (hybrid Vite/tsx) | Không | Không | Không | Không |
| Dockerfile | Recreate | **Có** | Không | Không |
| npm dependency | Recreate | **Có** | Không | Không |
| `.env` | Recreate app (khuyến nghị) | Không | Không | Không trực tiếp |
| Prisma schema | App mới | **Có** (generate) | **Có** | **Có** sau migrate |
| `compose restart` | Có | Không | Không | Không |
| `compose down` | N/A | Không | Không | Data volume giữ |
| `compose down -v` | N/A | Không | Không | **Mất data volume** |

---

## Ports mặc định `VERIFIED`

| | Host | Container |
|---|---|---|
| App Docker | 3080 | 3000 |
| Vite | 5173 | — |
| Backend tsx | 3000 (`PORT`) | — |
| Postgres | 5433 | 5432 |
| Redis | 6379 loopback | 6379 |
| MinIO S3 | 9000 | 9000 |

---

## UNKNOWN

Hành vi chính xác Docker Desktop Windows khi bind `./backups` path `d:\IT\...`.
