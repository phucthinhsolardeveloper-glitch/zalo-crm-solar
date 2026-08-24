# Local setup

## Full Docker

```bash
cp .env.example .env
# thay mọi placeholder secret; không dùng default dev cho production
docker compose up -d --build
docker exec zalo-crm-app npx prisma migrate deploy
```

App mặc định ở `http://localhost:3080`; PostgreSQL host ở `127.0.0.1:5433`. Không dùng `down -v` nếu cần giữ data.

## Hybrid

`docker-compose.dev.yml` chỉ chạy PostgreSQL 16 tại port 5433 với credential development có trong file. Backend và frontend chạy riêng:

```bash
docker compose -f docker-compose.dev.yml up -d
cd backend && npm install && npm run dev
cd ../frontend && npm install && npm run dev
```

Backend mặc định `3000`; Vite mặc định `5173` và proxy `/api`, `/socket.io` tới `VITE_BACKEND_URL` hoặc `http://localhost:3000`.

## First run

Áp migration trước; mở `/setup` để tạo organization và owner nếu `/api/v1/setup/status` báo cần setup. Không seed demo vào production.

## Giới hạn môi trường xác minh

Ngày 2026-08-24 môi trường Codex local không có Docker CLI. Test/typecheck/Vite build đã chạy trực tiếp; full Docker build chỉ được suy ra từ Dockerfile và production healthy cùng commit.
