# ZaloCRM — Quy trình setup, chạy project và checklist triển khai

## 1. Mục tiêu tài liệu

Tài liệu này tổng hợp quy trình thực tế đã chạy thành công trên môi trường Windows + Docker Desktop để:

- clone repository
- cài đặt môi trường cần thiết
- chuẩn bị file cấu hình
- khởi chạy hệ thống bằng Docker Compose
- chạy Prisma migration
- tạo tổ chức/admin lần đầu
- đổi mật khẩu admin lần đầu
- kiểm tra hệ thống hoạt động
- nhận diện các phần còn thiếu hoặc cần bổ sung cho triển khai tiếp theo

---

## 2. Kiến trúc tổng quan project

Project là một hệ thống CRM đa service theo mô hình Docker Compose, gồm:

- app: frontend + backend Node.js/TypeScript
- db: PostgreSQL
- redis: cache/queue message worker
- minio: object storage cho file/media
- backup: auto backup Postgres
- clamav: antivirus cho upload file

Các file cấu hình chính:

- [docker-compose.yml](docker-compose.yml)
- [.env](.env)
- [.env.example](.env.example)
- [docker/Dockerfile](docker/Dockerfile)
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma)
- [backend/src/config/index.ts](backend/src/config/index.ts)

---

## 3. Yêu cầu môi trường

### 3.1. Cài đặt Node.js

Project hiện đang hoạt động ổn trên Node 22, không nên dùng Node 20 hoặc các version cũ.

Khuyến nghị:

- Node 22 LTS
- npm đi kèm

Vì lý do thực tế đã gặp lỗi engine mismatch khi build docker, nên Node 22 là lựa chọn đúng cho repo này.

### 3.2. Cài đặt Docker Desktop

Trên Windows, bắt buộc phải có Docker Desktop đang chạy và Docker CLI sẵn sàng trong terminal.

Lệnh xác minh:

```powershell
C:\Users\ADMIN\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe version
```

Nếu Docker chưa chạy, project sẽ không thể start được.

### 3.3. Git

Cần clone repo từ GitHub hoặc từ source code đã có sẵn.

---

## 4. Quy trình clone và chuẩn bị repo

### 4.1. Clone repo

```bash
git clone <repo-url>
cd zalo-crm-solar
```

### 4.2. Kiểm tra cấu hình khởi tạo

Các file cần quan sát trước khi chạy:

- [.env.example](.env.example)
- [docker-compose.yml](docker-compose.yml)
- [docker/Dockerfile](docker/Dockerfile)

### 4.3. Tạo file .env

Dùng mẫu từ [.env.example](.env.example) để tạo file [.env](.env).

Các biến bắt buộc cần có giá trị hợp lệ gồm:

- DB_USER
- DB_PASSWORD
- DB_NAME
- JWT_SECRET
- ENCRYPTION_KEY
- MINIO_ROOT_USER
- MINIO_ROOT_PASSWORD
- REDIS_URL
- APP_URL
- CRM_LOGIN_URL

Ví dụ thực tế đã dùng:

```env
PORT=3000
APP_PORT=3080
DB_PORT=5433
REDIS_PORT=6379
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
HOST=0.0.0.0
NODE_ENV=development
APP_URL=http://localhost:3080
CRM_LOGIN_URL=http://localhost:3080

JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

DB_USER=crmuser
DB_PASSWORD=devpassword
DB_NAME=zalocrm
DATABASE_URL=postgresql://crmuser:devpassword@db:5432/zalocrm

REDIS_URL=redis://redis:6379

STORAGE_DRIVER=local
S3_ENDPOINT=
S3_PUBLIC_URL=
S3_BUCKET=zalocrm-attachments
S3_REGION=auto
S3_ACCESS_KEY=
S3_SECRET_KEY=

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
OMICALL_ENABLED=false
```

> Lưu ý: file trên phù hợp cho local dev; không phải production secret.

---

## 5. Quy trình chạy project

### Bước 1: Start stack

```powershell
cd D:\IT\zalo-crm-solar
C:\Users\ADMIN\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe compose up -d --build
```

Nếu các service chưa chạy, cần chờ vài phút cho image build và container start.

### Bước 2: Kiểm tra trạng thái service

```powershell
C:\Users\ADMIN\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe compose ps -a
```

Trạng thái mong muốn:

- app: running
- db: running
- redis: running
- minio: running
- backup: running
- clamav: running

### Bước 3: Check logs nếu app không lên

```powershell
C:\Users\ADMIN\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe compose logs --tail=120 app
```

---

## 6. Vấn đề thực tế đã phát hiện và cách sửa

### 6.1. Node version mismatch

Lỗi thực tế gặp phải: Docker build fail do dependency yêu cầu Node >= 22.

Cách sửa:

- chỉnh [docker/Dockerfile](docker/Dockerfile) để dùng `node:22-alpine`
- không dùng Node 20

### 6.2. Prisma schema chưa apply

Lỗi thực tế gặp phải: `/api/v1/setup/status` báo `The table users does not exist`.

Nguyên nhân: DB container started nhưng schema chưa chạy migrate.

Cách sửa:

```powershell
C:\Users\ADMIN\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe compose exec -T app sh -lc 'npx prisma migrate deploy'
```

Hoặc kiểm tra trạng thái:

```powershell
C:\Users\ADMIN\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe compose exec -T app sh -lc 'npx prisma migrate status'
```

### 6.3. Setup screen redirect không hoạt động nếu chưa migrate

Khi chưa migrate, app sẽ:

- load login page
- gọi `/api/v1/setup/status`
- trả lỗi do table chưa có

Sau khi migrate xong, flow setup chạy đúng.

---

## 7. Quy trình khởi tạo admin ban đầu

Sau khi app chạy và DB schema đã apply, vào trình duyệt:

```text
http://localhost:3080
```

### Bước 1: Màn hình setup

- Tên tổ chức
- Họ tên quản trị viên
- Email đăng nhập
- Số điện thoại chủ tổ chức
- Mật khẩu

Dùng form trên màn hình `/setup` để tạo tổ chức và admin đầu tiên.

Ví dụ thực tế đã dùng:

- Tên tổ chức: HS Holding
- Họ tên: Admin User
- Email: admin@hs.com
- Số điện thoại: 0901234567
- Mật khẩu: Admin@123

### Bước 2: Sau khi setup

App sẽ chuyển sang flow bắt buộc đổi mật khẩu lần đầu:

```text
http://localhost:3080/setup-password
```

Đây là flow bình thường, không phải lỗi. Người dùng phải đổi mật khẩu mới trước khi vào dashboard.

### Bước 3: Đổi mật khẩu lần đầu

- Mật khẩu admin giao: Admin@123
- Mật khẩu mới: ví dụ HsHolding@2026
- Nhập lại mật khẩu mới
- bấm Đổi mật khẩu

Sau đó hệ thống logout và redirect về login với query `password-changed=1`.

---

## 8. Quy trình đăng nhập và kiểm tra hệ thống

### Login cơ bản

- Email/SĐT: admin@hs.com hoặc số điện thoại
- Mật khẩu: mật khẩu mới đã đổi

Sau khi login, app sẽ vào dashboard chính.

### Kiểm tra nhanh

- Dashboard load được
- menu hiển thị đúng
- không còn lỗi setup
- không còn lỗi table users

---

## 9. Các lỗi còn lại và cách hiểu đúng

### 9.1. 503 Tổng đài chưa được bật

Trong runtime thực tế, có lỗi:

```text
/api/v1/telephony/omicall/connect-config
Tổng đài chưa được bật
```

Nguyên nhân: [backend/src/modules/telephony/telephony-routes.ts](backend/src/modules/telephony/telephony-routes.ts) kiểm tra `OMICALL_ENABLED`.

Nếu `.env` có:

```env
OMICALL_ENABLED=false
```

thì route trả 503. Đây là lỗi có tính cấu hình, không phải lỗi DB/compile.

Cách xử lý:

- nếu không dùng tính năng tổng đài: bỏ qua
- nếu có dùng: bật `OMICALL_ENABLED=true` và cấu hình đầy đủ domain / hotline / secret

### 9.2. Production secrets

Các biến nhạy cảm hiện tại đang đơn giản cho dev local:

- JWT_SECRET
- ENCRYPTION_KEY
- MINIO_ROOT_PASSWORD
- DB_PASSWORD

Nên thay bằng secret thật khi triển khai thực tế.

### 9.3. Storage local

Hiện `STORAGE_DRIVER=local` hợp cho dev. Nếu chạy production thực chất và cần lưu file ổn định, cần chuyển sang MinIO/S3/R2.

---

## 10. Checklist triển khai lại từ đầu

### 10.1. Môi trường local

- [ ] Cài Node 22
- [ ] Cài Docker Desktop + chạy Docker
- [ ] Clone repo
- [ ] Copy [.env.example](.env.example) thành [.env](.env)
- [ ] Điền DB, JWT, MinIO credentials

### 10.2. Chạy app

- [ ] docker compose up -d --build
- [ ] docker compose ps
- [ ] docker compose logs app

### 10.3. Khởi tạo DB

- [ ] docker compose exec app npx prisma migrate deploy
- [ ] docker compose exec app npx prisma migrate status

### 10.4. Setup admin lần đầu

- [ ] truy cập http://localhost:3080/setup
- [ ] tạo org + admin
- [ ] đổi mật khẩu lần đầu
- [ ] login lại bằng mật khẩu mới

### 10.5. Kiểm tra chức năng chính

- [ ] Dashboard hoạt động
- [ ] Login/cookie token OK
- [ ] MinIO chạy
- [ ] Database connect OK
- [ ] nếu cần Omicall: cấu hình đầy đủ và bật

---

## 11. Khuyến nghị triển khai thực tế

### Recommended production checklist

- đặt lại tất cả secret bằng key thật, không dùng dev default
- dùng Docker + Docker Compose trên máy chủ thực
- bật HTTPS / reverse proxy
- tách environment dev và production
- dùng MinIO/S3/R2 thay local storage nếu cần tính ổn định
- sao lưu DB định kỳ
- kiểm tra backup và restore
- tắt các service không cần dùng nếu chưa cấu hình

---

## 12. Kết luận

Quy trình setup/chạy project đã được xác thực thành công theo các bước sau:

1. cài Node 22 + Docker Desktop
2. clone repo
3. tạo file .env từ sample
4. chạy docker compose up -d --build
5. chạy prisma migrate deploy
6. mở /setup để tạo org + admin
7. đổi mật khẩu lần đầu tại /setup-password
8. login bằng mật khẩu mới
9. hệ thống chạy và dashboard hiển thị

Đây là quy trình chuẩn để triển khai lại project trên máy local hoặc server mới.

---

## 13. Ghi chú cuối

Trong quá trình chạy thực tế, các lỗi chính đã xuất hiện do:

- thiếu Docker/Node trong terminal
- phiên bản Node không phù hợp
- Prisma chưa apply migration
- first-run setup chưa hoàn thành

Những lỗi này đều đã được xử lý và hệ thống đã chạy ổn sau khi thực hiện đúng các bước trên.
