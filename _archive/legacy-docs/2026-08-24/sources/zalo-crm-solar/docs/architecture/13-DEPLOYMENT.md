# 13 — Deployment

## Pipeline thực tế trong **repo này** `VERIFIED`

```text
Developer PC
  → git commit/push
  → GitHub phucthinhsolardeveloper-glitch/zalo-crm-solar
  → (không có GitHub Actions trong repo)
  → VPS/host: git pull
  → ./scripts/zalocrm-deploy.sh  (hoặc docker compose up -d --build)
  → prisma migrate deploy trong container app
  → HTTP APP_PORT
```

**Không VERIFIED:** hostname VPS, Cloudflare, nginx config của Phúc Thịnh (không có file trong repo). Upstream docs giả định domain + reverse proxy: `docs/HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md`.

---

## Build `VERIFIED`

Dockerfile multi-stage → một image chứa `dist/` backend + `static/` frontend.  
Deploy script `CORE_SERVICES=(app db redis minio minio-init)` — **không** bật clamav/backup trừ khi compose up all.

`zalocrm-deploy.sh`:

1. `ensure_env` nếu chưa có `.env` (random secrets)
2. `is_existing` = db container + `count(*) FROM users > 0` → upgrade
3. upgrade: `backup_db` `pg_dump` ra file SQL cwd
4. `docker compose up -d --build` core
5. `docker exec app npx prisma migrate deploy`
6. upgrade: `UPDATE users SET jwt_token_version = jwt_token_version + 1`
7. `docker compose restart app`
8. curl `http://localhost:$APP_PORT/` expect 200

**Không** `down -v`.

---

## Reverse proxy / HTTPS `INFERRED` từ comments

`app.ts` `trustProxy: true` — thiết kế sau Cloudflare/nginx/Caddy.  
MinIO :9000 comment: production **phải** TLS proxy; console :9001 loopback.

`APP_URL` phải HTTPS thật để CSP/WSS và link Zalo CDN fetch attachment.

---

## Domain `UNKNOWN` (fork)

`.env.example` mẫu `APP_URL=https://zalocrm.locnguyendata.com` — đó là **upstream example**, không chứng minh domain prod Phúc Thịnh.

---

## Backup / restore `VERIFIED`

- Service `backup` daily → `./backups` keep days/weeks/months.
- Script `backup-postgres.sh` / deploy `backup` mode.
- Restore: `restore-postgres-test.sh` (test); runbook production docs upstream § restore.

Rebuild image **không** restore/ghi đè DB.

---

## Rollback `INFERRED`

Git checkout tag cũ + rebuild image + **migrate down không có trong script**. Prisma migrate **forward**. Rollback schema = restore `pg_dump` + image cũ.

Cutover bump `jwt_token_version` → mọi user login lại.

---

## CI/CD `VERIFIED` absent

Không `.github/workflows`. Deploy = thủ công/script trên server.

---

## Mobile / Montgomery `UNKNOWN`

`.env.example` nhắc `docker-compose.montgomery.yml` + secret Firebase — **file không có** trong scan. Push production stack đó **không document được** từ repo này.
