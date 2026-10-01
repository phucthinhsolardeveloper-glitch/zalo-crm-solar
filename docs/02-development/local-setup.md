# Local setup

## WSL2 (khuyến nghị trên Windows)

Chạy lệnh trong Ubuntu/Debian WSL2 và đặt source trong filesystem Linux để tránh
chậm file watcher hoặc lỗi permission:

```bash
cd /mnt/d/IT/zalo-crm-solar
./bin/wsl-setup
cd ~/src/zalo-crm-solar
```

Script không xóa source cũ, Docker volume hoặc secret. Nếu Docker CLI báo
`permission denied` với `/var/run/docker.sock`, kiểm tra Docker Desktop → Resources
→ WSL Integration cho đúng distro rồi chạy `wsl.exe --shutdown` từ PowerShell.

## Full Docker

```bash
cp .env.example .env
docker compose up -d --build
docker exec zalo-crm-app npx prisma migrate deploy
```

App mặc định ở `http://localhost:3080`. PostgreSQL dùng host port từ `DB_PORT`;
workspace WSL hiện dùng `5543` vì port `5433` đang được project khác sử dụng.
Không dùng `docker compose down -v` nếu cần giữ data.

Đây là runtime nghiệm thu local chuẩn của workspace. Image `app` chứa snapshot
frontend/backend tại lần build gần nhất; thay đổi source sau đó không tự xuất hiện
trên `:3080`. Sau khi sửa code, rebuild đúng service rồi kiểm tra lại `:3080`:

```bash
docker compose up -d --build app
docker compose ps app
curl -fsS http://localhost:3080/health
```

Nếu thay đổi có migration, dùng quy trình backup + `prisma migrate deploy` trong
deployment docs; không dùng lệnh rebuild frontend để né migration cần thiết.

## Hybrid local

`docker-compose.dev.yml` dùng PostgreSQL development tại port `5433`. Khi port này
bị chiếm, sửa port mapping và `backend/.env` đồng bộ, ví dụ dùng `5543`:

```bash
docker compose -f docker-compose.dev.yml up -d
cd backend && npm ci && npm run dev
cd ../frontend && npm ci --legacy-peer-deps && npm run dev
```

Backend mặc định `3000`; Vite mặc định `5173` và proxy `/api`, `/socket.io` tới
`VITE_BACKEND_URL` hoặc `http://localhost:3000`.

Full Docker và Hybrid là hai chế độ thay thế nhau, không phải hai bản local để
nghiệm thu đồng thời. Khi chọn Hybrid, URL browser là `:5173`; khi chọn Full
Docker, URL browser là `:3080`. Port Vite tạm như `:5183` chỉ dùng chẩn đoán cô
lập và không được coi là bằng chứng rằng container `:3080` đã cập nhật.

## First run

Áp migration trước; mở `/setup` để tạo organization và owner nếu
`/api/v1/setup/status` báo cần setup. Không seed demo vào production.
