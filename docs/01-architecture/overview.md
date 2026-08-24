# Kiến trúc tổng thể

```text
Browser/PWA
  → Vue SPA + Axios + Socket.IO client
  → Fastify :3000 (REST, static SPA, Socket.IO)
  → Prisma/adapter-pg → PostgreSQL 16
  → Redis 7 (BullMQ/cache/event support)
  → local volume hoặc S3/R2 storage
  → Zalo / OmiCall / Telegram / AI / outbound webhooks
```

Docker map host `${APP_PORT:-3080}` vào app `3000`. Một production image build frontend và backend; không có worker container riêng. Cron, Zalo reconnect, queue worker và integration jobs được start trong process app sau `listen()`.

## Boundary

- Frontend sở hữu navigation/UI state; không phải enforcement boundary.
- Fastify route/middleware/service sở hữu auth, permission, validation và orchestration.
- Prisma schema/migration sở hữu cấu trúc dữ liệu; PostgreSQL là persistent source.
- Redis giữ queue/cache với AOF; không thay PostgreSQL.
- File bytes nằm local volume hoặc S3-compatible storage; DB giữ metadata/reference.
- External provider là dependency không được coi là transactional với DB.

Chi tiết component: `components.md`; luồng: `request-flow.md`, `data-flow.md`.
