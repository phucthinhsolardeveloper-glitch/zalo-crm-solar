# SYSTEM-MAP — Zalo CRM Solar (đọc đầu tiên)

**Cập nhật:** 2026-08-20. **Edition:** Community (không `_ee`). **Git HEAD:** `11196b2` trên `fix/omicall-sip-call-history` (= local `main`). **origin/main:** chậm 1 commit.

Độ tin cậy: xem từng file numbered. Đây là **mục lục điều hướng**, không thay source.

```text
PROJECT zalo-crm-solar  (Fastify + Vue, Docker app monolith)
│
├── FRONTEND          Vue3 Vite Pinia Vuetify  → 03-FRONTEND.md
│     entry main.ts · router · axios /api/v1 · Socket.IO
│     layouts DefaultLayout + TelephonySoftphone
│
├── BACKEND           Fastify app.ts · 27 modules · jobs in-process  → 04-BACKEND.md
│
├── API               /api/v1 JWT · /api/public X-Api-Key · /health  → 05-API.md
│
├── DATABASE          Postgres 16 · Prisma 7 · 112 models · 114 mig  → 06-DATABASE.md
│     Contact + Friend · Conversation/Message · User · TelephonyCall
│
├── CRUD              routes + prisma, không repository layer       → 07-CRUD-FLOWS.md
│
├── AUTH              bcrypt · JWT 15m · refresh rotation · RBAC    → 08-AUTHENTICATION.md
│
├── INTEGRATIONS      Zalo zca-js · OmiCall · Telegram · S3/R2      → 09-INTEGRATIONS.md
│                     Redis/BullMQ · AI · webhook · optional crm-custom
│
├── DOCKER            compose: app db redis minio backup clamav     → 10-DOCKER.md
│                     KHÔNG bind-mount source
│
├── LOCAL DEVELOPMENT Docker full rebuild  HOẶC  compose.dev+tsx+Vite → 11-LOCAL-DEVELOPMENT.md
│
├── ENVIRONMENT       .env.example · config/index.ts                → 12-ENVIRONMENT.md
│
├── DEPLOYMENT        zalocrm-deploy.sh · không GitHub Actions      → 13-DEPLOYMENT.md
│
├── GITHUB            origin .../zalo-crm-solar · main vs fix       → 14-GIT-BRANCHES.md
│
└── CHANGE IMPACT     schema → API → FE; env OmiCall restart        → 15-CHANGE-IMPACT.md
                      TROUBLESHOOTING                               → 16-TROUBLESHOOTING.md
```

---

## Architecture (một trang)

Trình duyệt → (prod) cổng 3080 container Fastify phục vụ SPA+API+WS → Prisma → Postgres. Redis queue. File local volume hoặc R2. Zalo SDK giữ session trong DB. OmiCall: SIP trên **browser**, CDR qua webhook/API vào `telephony_calls`.

## Data flow

UI composable → axios JWT → route → service/prisma/zaloPool → DB → JSON/socket → UI.

## Database

Một cluster Postgres volume `pg_data`. Migrate **tường minh**. Rebuild image ≠ đổi data.

## CRUD

UI → `/api/v1/...` → `*-routes.ts` → `prisma.*` → response.

## Docker

Một image app Node; sidecar db/redis/minio. `down -v` xóa data.

## Local

Sửa code Docker = rebuild. Hybrid = HMR.

## Deployment

Push GitHub → pull VPS → build compose → `migrate deploy`.

## Git

Fix branch committed **trùng** local main; **WIP chưa commit** trên 6 file OmiCall UI/API; **origin/main** thiếu `11196b2`.

## Change impact

Mọi field DB cần migration + rebuild Prisma client + API + FE.

## Unknown (còn lại)

VPS/domain/HTTPS thật; GitHub branch protection; Montgomery/Firebase compose; catalog Socket event đầy đủ; EE bundle; xóa CDR UI; RLS đã bật prod hay chưa. `prisma/seed.ts` **verified absent**.
