# Vận hành VPS Production — ZaloCRM (server `zalo-crm-pts`)

> Tài liệu **riêng cho server production thật** (IP `14.225.222.26`, hostname `zalo-crm-pts`).
> Khác với [`HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md`](./HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md)
> (hướng dẫn tổng quát cho bất kỳ ai deploy ZCRM) — file này ghi lại **chính xác** những gì đã
> làm trên server này + giải thích **bản chất/luồng hoạt động**, để lần sau đọc lại là hiểu và
> thao tác được ngay, không cần dò lại từ đầu.
>
> Cập nhật lần cuối: **2026-08-22** (lần deploy đầu tiên lên server này).

---

## 0. Hiểu luồng hệ thống trước khi làm gì khác

### 0.1. Project được deploy từ đâu — GitHub hay Docker?

Hai thứ này **không thay thế nhau** — chúng làm 2 việc khác nhau trong cùng 1 luồng:

```
┌─────────────────┐    git push     ┌──────────────────┐   git pull    ┌─────────────────┐
│  Máy dev         │ ──────────────► │  GitHub (repo)    │ ─────────────► │  Server VPS      │
│  D:\IT\           │                 │  phucthinhsolar-  │                │  ~/zcrm/          │
│  zalo-crm-solar   │                 │  developer-glitch/│                │  (bản clone)      │
│  (anh sửa code    │                 │  zalo-crm-solar   │                │                   │
│   ở đây)          │                 │                    │                │                   │
└─────────────────┘                 └──────────────────┘                └────────┬─────────┘
                                                                                   │ docker compose
                                                                                   │ up -d --build
                                                                                   ▼
                                                                          ┌─────────────────┐
                                                                          │  Docker           │
                                                                          │  (đóng gói code    │
                                                                          │   thành image,     │
                                                                          │   chạy container)  │
                                                                          └─────────────────┘
```

- **GitHub = nơi lưu MÃ NGUỒN** (source of truth cho code). Repo:
  `https://github.com/phucthinhsolardeveloper-glitch/zalo-crm-solar` (public, branch đang chạy
  production: `fix/omicall-sip-call-history`).
- **Docker = công cụ ĐÓNG GÓI + CHẠY** mã nguồn đó. Docker **không tự lưu code vĩnh viễn** — mỗi
  lần `docker compose up --build`, nó đọc code đang nằm trong thư mục `~/zcrm` trên server (thư
  mục đó là **bản clone Git** của repo) rồi build thành 1 "image" (gói phần mềm đóng gói sẵn),
  sau đó chạy "container" (1 tiến trình cô lập) từ image đó.
- Vậy trên server, **`~/zcrm` chính là 1 git repo bình thường** — `git pull` ở đó hoạt động y hệt
  như trên máy dev.

**Vì sao tách 2 lớp này?** Vì code (logic, giao diện) và cách CHẠY code (môi trường, dependency,
version Node/Postgres...) là 2 mối lo khác nhau. Docker đảm bảo server chạy **đúng y hệt** môi
trường đã test ở máy dev (không bị lệch version thư viện), còn Git đảm bảo lịch sử thay đổi code
được lưu vết, revert được, nhiều người cùng sửa được.

### 0.2. Data (Postgres/MinIO/Redis) nằm đâu — có liên quan gì tới code không?

**Không liên quan.** Đây là điểm quan trọng nhất cần hiểu để không sợ "update code lỡ mất dữ liệu":

- Docker có khái niệm **"named volume"** — 1 vùng lưu trữ trên đĩa server, **độc lập hoàn toàn**
  với code/image/container. Container có thể bị xoá và tạo lại (khi rebuild) nhưng volume thì
  KHÔNG tự mất, trừ khi ai đó chủ động xoá nó.
- Trên server này, đã tạo 5 volume:

  | Volume | Chứa gì | Vị trí thật trên đĩa server |
  |---|---|---|
  | `zcrm_pg_data` | **Toàn bộ database Postgres** (khách hàng, cuộc gọi, tin nhắn, user, mọi bảng) | `/var/lib/docker/volumes/zcrm_pg_data/_data` |
  | `zcrm_minio_data` | File ảnh/video/audio khách hàng gửi qua chat (MinIO/S3) | `/var/lib/docker/volumes/zcrm_minio_data/_data` |
  | `zcrm_file_storage` | File upload khác (nếu dùng storage local thay vì MinIO) | `/var/lib/docker/volumes/zcrm_file_storage/_data` |
  | `zcrm_redis_data` | Hàng đợi job (BullMQ), cache tạm | tự phục hồi được nếu mất, không cần backup |
  | `zcrm_clamav_data` | Database virus của ClamAV | tự tải lại được, không cần backup |

  > Không cần vào các thư mục này bằng tay — chỉ liệt kê ở đây để anh hiểu dữ liệu **thật sự**
  > nằm ở đâu trên ổ đĩa vật lý, tách biệt hẳn khỏi thư mục code `~/zcrm`.

- **Mối quan hệ container ↔ volume:** khi container `zalo-crm-db` khởi động, Docker "gắn"
  (mount) volume `zcrm_pg_data` vào đường dẫn `/var/lib/postgresql/data` **bên trong** container.
  Postgres bên trong container ghi/đọc dữ liệu vào đường dẫn đó như bình thường, nhưng thực chất
  dữ liệu nằm ở volume ngoài — nên dù container bị xoá/tạo lại, volume (= dữ liệu) vẫn còn.

### 0.3. Deploy lần đầu (DB rỗng) vs deploy lần sau (update code) — có bị ghi đè dữ liệu không?

**KHÔNG bị ghi đè**, miễn là làm đúng quy trình ở §4. Giải thích bản chất:

**Lần đầu (2026-08-22, đã làm):**
1. Volume `zcrm_pg_data` **chưa tồn tại** → Docker tự tạo volume **rỗng**.
2. Container `zalo-crm-db` (Postgres) khởi động lần đầu, thấy thư mục data rỗng → tự tạo database
   mới theo `DB_USER`/`DB_PASSWORD`/`DB_NAME` khai trong `.env` (đây là hành vi mặc định của
   Postgres official image — **chỉ init khi thư mục data rỗng**).
3. Chạy `prisma migrate deploy` → tạo toàn bộ bảng (schema: contacts, calls, users, ...) vào
   database rỗng đó.
4. → Kết quả: DB có đầy đủ bảng nhưng 0 dòng dữ liệu (đúng như hiện trạng bây giờ).

**Lần sau (mỗi khi update code, xem quy trình đầy đủ ở §4):**
1. `docker compose up -d --build app` — để ý lệnh này có chữ `app` ở cuối, tức là **chỉ** target
   service `app` (backend/frontend), **KHÔNG đụng** tới service `db`.
2. Ngay cả trong trường hợp hiếm khi phải rebuild `db`: volume `zcrm_pg_data` **đã có dữ liệu**
   (không rỗng nữa) → Postgres image khi khởi động sẽ **bỏ qua bước init**, chỉ đọc dữ liệu có
   sẵn lên. `DB_USER`/`DB_PASSWORD`/`DB_NAME` trong `.env` lúc này **không còn tác dụng** (chỉ áp
   dụng đúng 1 lần lúc volume còn rỗng) — đây cũng là lý do **không nên đổi `DB_PASSWORD` sau khi
   đã chạy lần đầu**, vì đổi trong `.env` không làm Postgres tự đổi mật khẩu thật đang lưu trong
   volume, dẫn đến app không kết nối được DB nữa.
3. `prisma migrate deploy` chỉ áp **các migration MỚI** (file mới thêm vào `backend/prisma/
   migrations/` từ lần deploy trước tới giờ) — Prisma tự nhớ migration nào đã chạy rồi (lưu trong
   bảng `_prisma_migrations`), không chạy lại migration cũ, không xoá dữ liệu hiện có. Migration
   thường là "additive" (thêm cột/bảng mới), gần như không bao giờ xoá dữ liệu trừ khi migration
   đó được viết để làm vậy (hiếm, luôn review trước khi migrate trên production thật).

**Điều DUY NHẤT thực sự xoá sạch dữ liệu:**
- `docker compose down -v` (cờ `-v` = xoá cả volume) — **KHÔNG BAO GIỜ** dùng lệnh này trên server
  production trừ khi cố ý reset từ đầu.
- `docker volume rm zcrm_pg_data` thủ công.
- Cả 2 đều **không nằm trong quy trình update bình thường** ở §4 — nên update code định kỳ là
  an toàn với dữ liệu.

### 0.4. Muốn thêm/sửa API, tính năng thì làm ở đâu, theo luồng nào?

1. **Sửa code ở máy dev** (`D:\IT\zalo-crm-solar`), không sửa trực tiếp trên server:
   - API/backend logic: `backend/src/modules/<tên-module>/*.ts` (vd `contact-routes.ts`,
     `telephony-routes.ts`) — Fastify route, đăng ký bằng `app.get(...)`, `app.post(...)`, v.v.
   - Giao diện: `frontend/src/views/*.vue`, `frontend/src/components/**/*.vue` (Vue 3 + Vuetify).
   - Đổi cấu trúc bảng DB: sửa `backend/prisma/schema.prisma`, rồi chạy **ở máy dev**:
     ```bash
     cd backend && npx prisma migrate dev --name mo-ta-ngan-thay-doi
     ```
     Lệnh này tạo 1 file migration mới trong `backend/prisma/migrations/` — **file này phải được
     commit vào git** (nó chính là "hướng dẫn" để production biết cần đổi gì khi
     `migrate deploy`). Trên production **không bao giờ** chạy `migrate dev` (lệnh đó có thể hỏi
     tương tác + có nguy cơ reset DB khi có xung đột).
2. **Test kỹ ở máy dev** trước khi đẩy lên server: typecheck (`vue-tsc -b`, `tsc --noEmit`),
   `vitest run`, build thật (`npm run build`), build Docker local, test bằng browser.
3. `git add` → `git commit` → `git push` lên GitHub (nhánh đang deploy:
   `fix/omicall-sip-call-history`, hoặc merge vào `main` nếu đổi chiến lược nhánh sau này).
4. SSH vào server, làm theo quy trình update ở §4 (về bản chất: `git pull` + build lại + migrate).

---

## 1. Thông tin server

| Mục | Giá trị |
|---|---|
| IP | `14.225.222.26` |
| Hostname | `zalo-crm-pts` |
| OS | Ubuntu 22.04.5 LTS |
| Spec | 4 vCPU / 5.8 GB RAM / 49 GB disk (đủ yêu cầu tối thiểu 2-4 vCPU/4GB) |
| Truy cập | SSH key-based, user `root`, `ssh root@14.225.222.26` |
| Thư mục code | `~/zcrm` (= `/root/zcrm`) — là 1 git clone của repo GitHub |
| Domain | **Chưa có** — hiện truy cập qua `http://14.225.222.26:3080` (xem §7) |

**Thêm SSH key mới** (khi có máy/dev mới cần truy cập):
```bash
# Trên server, dán public key của máy mới vào:
echo "<public-key-của-máy-mới>" >> ~/.ssh/authorized_keys
```
> ⚠️ Nếu dán qua terminal dễ bị lỗi "bracketed paste" (ký tự `^[[200~` chèn vào giữa lệnh làm
> `mkdir: command not found`) — chạy **từng lệnh một dòng**, đừng dán cả khối nhiều lệnh nối `&&`.

---

## 2. Kiến trúc deploy

Docker Compose, 6 service (định nghĩa trong `docker-compose.yml` ở root repo):

| Service | Container | Port host | Ghi chú |
|---|---|---|---|
| `app` | `zalo-crm-app` | `3080` → 3000 | Fastify backend + Vue frontend (SPA) — **service DUY NHẤT bị rebuild khi update code** |
| `db` | `zalo-crm-db` | `127.0.0.1:5433` | Postgres 16, chỉ bind localhost (không truy cập từ ngoài Internet) |
| `redis` | `zalo-crm-redis` | `127.0.0.1:6379` | BullMQ + cache, chỉ bind localhost |
| `minio` | `zalo-crm-minio` | `9000` (public), `127.0.0.1:9001` (console) | S3-compatible, port 9000 PHẢI public để Zalo CDN fetch ảnh/media gửi đi |
| `clamav` | `zalo-crm-clamav` | nội bộ (3310) | Quét virus upload, `MEDIA_AV_ENABLED=1` |
| `backup` | `zalo-crm-backup` | — | Tự `pg_dump` hằng ngày, ghi ra `~/zcrm/backups/` trên **host** (không phải volume — xem §5) |

---

## 3. Lần deploy đầu tiên (đã thực hiện 2026-08-22)

Ghi lại để hiểu lịch sử, **không cần chạy lại** trừ khi build server mới từ đầu.

```bash
# 1. Cài Docker (script chính chủ Docker)
curl -fsSL https://get.docker.com | sh

# 2. Clone code (branch đang chạy: fix/omicall-sip-call-history, commit 53284fe)
git clone --branch fix/omicall-sip-call-history --single-branch \
  https://github.com/phucthinhsolardeveloper-glitch/zalo-crm-solar.git ~/zcrm
cd ~/zcrm

# 3. Tạo .env từ .env.example + sinh secret ngẫu nhiên (JWT_SECRET, ENCRYPTION_KEY,
#    DB_PASSWORD, MINIO_ROOT_PASSWORD, S3_SECRET_KEY, TOKEN_ENCRYPTION_KEY — mỗi cái
#    openssl rand -hex 32/16). Set APP_URL=http://14.225.222.26:3080 (chưa có domain).
#    Set MINIO_ROOT_USER/S3_ACCESS_KEY=zcrmadmin, S3_BUCKET=zalocrm-attachments.
#    → giá trị thật nằm trong ~/zcrm/.env trên server, KHÔNG copy ra ngoài/paste vào chat.
chmod 600 .env

# 4. Build + chạy — volume CHƯA tồn tại nên Postgres tự tạo DB rỗng (xem §0.3)
docker compose up -d --build app db redis minio minio-init clamav backup

# 5. Migrate DB — tạo toàn bộ bảng vào DB rỗng
docker exec zalo-crm-app npx prisma migrate deploy
docker compose restart app     # boot sạch sau khi có bảng

# 6. Kiểm tra
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3080/     # → 200
curl -s http://localhost:3080/api/v1/setup/status                    # → {"needsSetup":true}
docker compose ps                                                    # tất cả "healthy"
```

**Kết quả:** 6/6 container healthy, DB migrate sạch (không data cũ — server mới hoàn toàn),
`needsSetup:true` (đúng vì chưa tạo tài khoản).

**Việc cần làm tiếp ngay:** mở `http://14.225.222.26:3080/setup` để tạo tổ chức + tài khoản chủ
(owner) đầu tiên.

---

## 4. Quy trình cập nhật code (deploy lại khi có thay đổi)

Mỗi khi có code mới (fix bug, thêm tính năng) đã test xong ở máy dev và đã `git push`:

```bash
ssh root@14.225.222.26
cd ~/zcrm

# 1. BACKUP DB trước khi làm gì (luôn luôn, kể cả update nhỏ)
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-truoc-update-$(date +%F-%H%M).sql
ls -lh backup-truoc-update-*.sql      # phải > 0 byte

# 2. Lấy code mới (đây là bước "GitHub → server" — xem luồng ở §0.1)
git pull

# 3. Kiểm .env: GIỮ NGUYÊN JWT_SECRET/ENCRYPTION_KEY/DB_PASSWORD/MinIO — đổi = mất phiên/dữ liệu
#    (xem lý do kỹ thuật ở §0.3 — Postgres không tự đổi mật khẩu theo .env sau lần đầu).
#    Chỉ thêm biến MỚI nếu code mới yêu cầu (xem CHANGELOG.md / .env.example diff).

# 4. Build lại — CHỈ service "app" (xem §0.3 vì sao service "db" không bị đụng tới)
#    ⚠️ KHÔNG bao giờ dùng "down -v" — xoá sạch database
docker compose up -d --build app

# 5. Migrate DB — CHỈ áp các migration MỚI (Prisma tự biết cái nào đã chạy rồi)
#    LUÔN "migrate deploy", KHÔNG BAO GIỜ "migrate dev" trên production
docker exec zalo-crm-app npx prisma migrate deploy

# 6. Nếu có thay đổi ảnh hưởng phiên đăng nhập (đổi JWT logic) — cutover ép đăng nhập lại:
docker exec zalo-crm-db psql -U crmuser -d zalocrm -c \
  "UPDATE users SET jwt_token_version = jwt_token_version + 1;"
docker compose restart app

# 7. Kiểm tra sau update
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3080/
docker compose ps                                              # tất cả "healthy"
docker logs zalo-crm-app --tail 30                             # không có ERROR bất thường
```

**Rollback nếu sự cố:**
```bash
git log --oneline -5                       # tìm commit cũ ổn định
git checkout <commit-cu> && docker compose up -d --build app
# Migration thường additive (không xoá cột/bảng) → không cần rollback DB.
# Nếu bắt buộc phải khôi phục DB:
cat backup-truoc-update-*.sql | docker exec -i zalo-crm-db psql -U crmuser zalocrm
```

> 🛑 Quy tắc vàng: **KHÔNG BAO GIỜ** `docker compose down -v` trên server này trừ khi cố ý
> reset sạch từ đầu (mất toàn bộ KH, cuộc gọi, media...).

---

## 5. Backup / Restore

- **Vị trí thật:** service `backup` ghi file `pg_dump` (nén `.sql.gz`) vào thư mục
  `~/zcrm/backups/` **trên host** (đây là "bind mount" — thư mục thường, xem được bằng `ls`
  ngay, khác với named volume ở §0.2 phải qua `docker volume inspect` mới thấy đường dẫn thật).
- **Lịch tự động:** chạy `pg_dump` hằng ngày lúc 00:00 giờ VN, giữ 7 bản gần nhất (`daily/`) +
  4 tuần (`weekly/`) + 3 tháng (`monthly/`). *(Tại thời điểm viết tài liệu, thư mục `backups/`
  còn trống vì server mới chạy — bản backup đầu tiên sẽ xuất hiện sau 00:00 giờ VN tới.)*
- **Backup thủ công (trước thao tác rủi ro):**
  ```bash
  docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-$(date +%F-%H%M).sql
  ```
- **Restore:**
  ```bash
  cat backup-file.sql | docker exec -i zalo-crm-db psql -U crmuser zalocrm
  ```
- **Tải backup về máy local để lưu ngoài server** (quan trọng — nếu server chết thì mất cả app
  lẫn backup nếu chỉ lưu 1 chỗ):
  ```bash
  # Chạy TỪ máy dev Windows (Git Bash):
  scp root@14.225.222.26:~/zcrm/backups/daily/<file>.sql.gz ./
  ```
- Xem thêm quy trình chi tiết + kịch bản khôi phục thảm hoạ ở
  [`BACKUP-RESTORE-PROCEDURE.md`](../../BACKUP-RESTORE-PROCEDURE.md) (root `D:\IT`).

---

## 6. Quản lý secrets

Toàn bộ secret (JWT_SECRET, ENCRYPTION_KEY, DB_PASSWORD, MinIO credentials...) nằm **duy nhất**
trong `~/zcrm/.env` trên server (`chmod 600`, chỉ `root` đọc được). File này:

- **KHÔNG** nằm trong git (đã `.gitignore`), **KHÔNG** commit, **KHÔNG** paste vào chat/tài liệu.
- Sinh bằng `openssl rand -hex 32` (JWT_SECRET/ENCRYPTION_KEY/TOKEN_ENCRYPTION_KEY, 64 hex) và
  `openssl rand -hex 16` (DB_PASSWORD/MinIO, 32 hex).
- Muốn xem giá trị thật: SSH vào server, `cat ~/zcrm/.env`.
- **Đổi JWT_SECRET** = toàn bộ user bị đăng xuất (phải đăng nhập lại).
- **Đổi DB_PASSWORD/MinIO credentials** sau khi đã chạy lần đầu = **bắt buộc `down -v`** (mất dữ
  liệu) trừ khi backup/restore thủ công — lý do kỹ thuật xem §0.3.
  → Đừng đổi các mật khẩu này trừ khi thật sự cần.

---

## 6a. Bật Omicall (gọi điện) trên VPS — dùng chung tài khoản với máy dev

**Hiện trạng (phát hiện 2026-08-22):** VPS deploy lần đầu tạo `.env` từ `.env.example` mặc định
— `OMICALL_ENABLED=false`, các trường domain/hotline/webhook đều trống. Đây là lý do "kết nối
omni bị lỗi" trên VPS: **tính năng gọi chưa từng được bật ở đây**, không phải bug từ lần deploy
gần nhất. Máy dev local đã có cấu hình Omicall thật và gọi được bình thường.

Anh đã chọn: **dùng chung tài khoản Omicall thật đang dùng ở máy dev**. Dưới đây là hướng dẫn để
tự làm (chưa test luồng này bao giờ — nên làm cẩn thận, có bước rollback nếu lỗi).

### Các biến cần copy từ `.env` máy dev sang `.env` server

Trên **máy dev** (`D:\IT\zalo-crm-solar\.env`), các dòng cần lấy giá trị thật (đang có sẵn, đã
verify là tài khoản Omicall thật của công ty):

```
OMICALL_ENABLED=true
OMICALL_DOMAIN=...
OMICALL_WSS_URI=...
OMICALL_HOTLINE=...
OMICALL_OUTBOUND_NUMBER_MODE=...
OMICALL_WEBHOOK_SECRET=...
OMICALL_API_KEY=...
OMICALL_API_BASE_URL=...
```

> ⚠️ Đây là secret thật (đặc biệt `OMICALL_WEBHOOK_SECRET`/`OMICALL_API_KEY`) — không paste các
> giá trị này vào chat/tài liệu/nơi công khai. Copy trực tiếp giữa 2 file `.env`.

### Các bước thực hiện

1. **Mở song song 2 file** (máy dev, dùng editor bất kỳ):
   ```
   D:\IT\zalo-crm-solar\.env         ← nguồn (đã có giá trị thật)
   ```
   Ghi lại (tạm, chỉ trên máy mình) giá trị của 7 dòng `OMICALL_*` liệt kê ở trên.

2. **SSH vào server, sửa `.env`:**
   ```bash
   ssh root@14.225.222.26
   cd ~/zcrm
   nano .env
   ```
   Tìm và sửa đúng 7 dòng `OMICALL_*` ở trên bằng giá trị đã copy từ máy dev (giữ nguyên các dòng
   khác — đặc biệt các secret của server như `JWT_SECRET`/`DB_PASSWORD` KHÔNG đụng vào).
   Lưu (`Ctrl+O`, Enter, `Ctrl+X`).

3. **Recreate container để đọc lại `.env`** (restart không đủ):
   ```bash
   docker compose up -d app
   ```

4. **Kiểm tra đã nhận cấu hình:**
   ```bash
   curl -s http://localhost:3080/api/v1/telephony/omicall/connect-config \
     -H "Authorization: Bearer <token-đăng-nhập>"   # cần token thật — dễ nhất là kiểm tra qua UI (bước 5)
   ```

5. **Kiểm tra qua UI:** mở `http://14.225.222.26:3080`, đăng nhập, mở nút "Tổng đài nội bộ" (góc
   trên bên phải) — phải thấy trạng thái kết nối chuyển từ "Đang kết nối..." sang sẵn sàng (không
   còn báo lỗi). Thử gọi thử 1 cuộc nội bộ hoặc ra số thật để xác nhận.

### ⚠️ QUAN TRỌNG — tránh xung đột 2 nơi cùng đăng ký 1 tài khoản

Sau khi VPS kết nối Omicall thành công bằng CHUNG tài khoản với máy dev, **2 nơi cùng lúc đăng ký
cùng 1 extension SIP có thể tranh chấp nhau** (cuộc gọi đến có thể vào nhầm nơi, hoặc 1 bên bị
tổng đài từ chối đăng ký). Để tránh:

```bash
# Trên MÁY DEV (Windows, Git Bash), TẮT app container sau khi đã xác nhận VPS chạy ổn:
cd /d/IT/zalo-crm-solar
docker compose stop app
# (KHÔNG dùng "down" — "stop" giữ nguyên container để bật lại nhanh nếu cần, không mất gì)
```
Muốn bật lại app ở máy dev sau này (vd để code/test tính năng khác): `docker compose start app`.

### Rollback nếu có sự cố

```bash
ssh root@14.225.222.26
cd ~/zcrm
nano .env   # đổi lại OMICALL_ENABLED=false
docker compose up -d app
```
Tắt Omicall trên VPS không ảnh hưởng gì khác — các tính năng còn lại (Zalo chat, CRM, lịch hẹn...)
vẫn hoạt động bình thường.

---

## 7. Domain + HTTPS (Cloudflare Tunnel) — chưa cấu hình, hướng dẫn setup

Hiện app chỉ chạy `http://14.225.222.26:3080` — không mã hoá, không domain, người dùng phải nhớ
IP + port. Cần domain HTTPS trước khi đưa nhân viên vào dùng thật.

> Có `cloudflared.exe` + `config.yml` sẵn ở máy dev (`D:\IT`) nhưng `config.yml` đang **trống**
> (`{}`) — chưa từng cấu hình xong. Nên bỏ qua, setup **mới hoàn toàn trên server** (server chạy
> 24/7, máy dev Windows tắt là tunnel đứt — tunnel PHẢI chạy trên server, không phải máy dev).

### 7.1. Yêu cầu trước khi bắt đầu
- 1 domain đã trỏ nameserver về Cloudflare (miễn phí, vd mua ở Cloudflare Registrar/Namecheap rồi
  đổi NS sang Cloudflare).
- Tài khoản Cloudflare (miễn phí đủ dùng, không cần trả phí).
- Quyết định 2 subdomain sẽ dùng, vd:
  - `crm.tencongty.com` → cho app (giao diện CRM)
  - `file.tencongty.com` → cho MinIO (ảnh/media trong chat)

### 7.2. Tạo Tunnel trên Cloudflare Dashboard
1. Đăng nhập [dash.cloudflare.com](https://dash.cloudflare.com) → chọn domain đã thêm.
2. Vào **Zero Trust** (menu trái) → **Networks → Tunnels** → **Create a tunnel**.
3. Chọn loại **Cloudflared** → đặt tên (vd `zalo-crm-pts`) → **Save tunnel**.
4. Cloudflare hiện ra 1 lệnh cài đặt dạng:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb
   sudo cloudflared service install <TOKEN-DÀI-CLOUDFLARE-CẤP>
   ```
   → **Copy đúng lệnh Cloudflare hiện cho anh** (token là duy nhất cho tunnel này, không dùng
   token trong ví dụ) → chạy trên server:
   ```bash
   ssh root@14.225.222.26
   # rồi paste 2 dòng lệnh Cloudflare đưa, chạy TỪNG DÒNG một (tránh lỗi paste — xem §1)
   ```
5. Quay lại Dashboard → tab **Public Hostname** của tunnel vừa tạo → **Add a public hostname**,
   thêm 2 dòng:

   | Public hostname | Service |
   |---|---|
   | `crm.tencongty.com` | `HTTP` → `localhost:3080` |
   | `file.tencongty.com` | `HTTP` → `localhost:9000` |

   (Thay `tencongty.com` bằng domain thật của anh.)

### 7.3. Cập nhật `.env` trỏ sang domain mới
```bash
ssh root@14.225.222.26
cd ~/zcrm
nano .env
```
Sửa 3 dòng (giữ nguyên các dòng khác, đặc biệt secrets):
```
APP_URL=https://crm.tencongty.com
CRM_LOGIN_URL=https://crm.tencongty.com
S3_PUBLIC_URL=https://file.tencongty.com
```
Lưu file (`Ctrl+O`, Enter, `Ctrl+X` nếu dùng `nano`), rồi:
```bash
# QUAN TRỌNG: "restart" KHÔNG đủ — phải "up -d" để container đọc lại .env từ đầu
docker compose up -d app
```

### 7.4. Kiểm tra
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://crm.tencongty.com/          # → 200
curl -sI https://file.tencongty.com/minio/health/live | head -1              # → 200
```
Mở `https://crm.tencongty.com` trên trình duyệt — phải thấy ổ khoá HTTPS, không cảnh báo.

> Ảnh/sticker cũ đã lưu URL MinIO theo domain/IP cũ trong DB — nếu trước đó đã có dữ liệu test
> với `S3_PUBLIC_URL` khác, cần rewrite URL cũ trong DB (xem §6 "Đổi S3_PUBLIC_URL trên hệ đang
> chạy" trong `HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md`). Server này đang DB rỗng nên
> **không cần** bước này ở lần đầu.

---

## 8. Firewall (ufw) — chưa bật, hướng dẫn setup

Hiện tại `ufw status` → `inactive`, nghĩa là **mọi port** trên server đều mở ra Internet theo mặc
định của VPS (không có lớp chặn thêm ở tầng OS). Cần bật firewall, chỉ mở đúng port cần thiết.

> ⚠️ **Bắt buộc mở SSH (22) TRƯỚC khi bật ufw** — quên bước này sẽ tự khoá mình ra khỏi server,
> phải nhờ nhà cung cấp VPS can thiệp qua console mới vào lại được.

```bash
ssh root@14.225.222.26

# 1. Cho phép SSH TRƯỚC TIÊN (không bao giờ được bỏ qua bước này)
ufw allow 22/tcp

# 2. Cho phép app (port 3080) — cần thiết khi CHƯA có domain/Cloudflare Tunnel.
#    Sau khi setup xong Cloudflare Tunnel (§7), port này có thể ĐÓNG lại vì traffic
#    sẽ đi qua tunnel (outbound từ server, không cần mở port inbound) — cân nhắc sau.
ufw allow 3080/tcp

# 3. Cho phép MinIO S3 API (port 9000) — BẮT BUỘC mở vì Zalo CDN cần fetch ảnh/media
#    qua URL này (ghi rõ trong docker-compose.yml, không thể đóng port này).
ufw allow 9000/tcp

# 4. KHÔNG mở: 5433 (Postgres), 6379 (Redis), 9001 (MinIO console) — các port này đã
#    tự bind 127.0.0.1 trong docker-compose.yml (chỉ truy cập được từ chính server,
#    ufw không cần lo thêm, nhưng cũng không hại gì nếu muốn deny rõ ràng).

# 5. Bật firewall (sẽ hỏi xác nhận — gõ "y")
ufw enable

# 6. Kiểm tra
ufw status verbose
```

Kết quả mong đợi của `ufw status verbose`:
```
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
3080/tcp                   ALLOW IN    Anywhere
9000/tcp                   ALLOW IN    Anywhere
```

**Sau khi bật, kiểm tra ngay** (từ máy khác, KHÔNG đóng session SSH hiện tại cho tới khi xác nhận
xong — để còn cách sửa nếu lỡ khoá nhầm):
```bash
# Từ máy dev, mở terminal SSH MỚI (giữ session cũ đang mở để phòng hờ):
ssh root@14.225.222.26 "echo vẫn-vào-được"
curl -s -o /dev/null -w "%{http_code}\n" http://14.225.222.26:3080/
```

---

## 9. Việc còn thiếu khác (đọc trước khi đưa vào dùng thật)

### Đã biết, không phải bug (theo dõi thêm)
Từ [`FINAL-PRE-PRODUCTION-AUDIT-2026-08-21.md`](./FINAL-PRE-PRODUCTION-AUDIT-2026-08-21.md) —
audit gần nhất kết luận **"NOT READY FOR PRODUCTION"** với các điểm sau:

| Mục | Trạng thái tại audit (2026-08-21) | Cập nhật |
|---|---|---|
| Ghi âm cuộc gọi OmiCall chỉ 1 kênh (mono), chưa chắc đủ 2 chiều | Blocked (external, phụ thuộc OmiCall) | ✅ **Anh xác nhận 2026-08-22: đã OK, ghi đủ 2 chiều.** |
| Tính năng gọi điện (telephony) chưa có RBAC riêng — chỉ scope theo user/role trong code | Remaining | Chưa làm — cân nhắc nếu cần phân quyền chi tiết ai được nghe/gọi/xem ghi âm |
| CSP (Content-Security-Policy) mới ở chế độ `report-only`, chưa `enforce` | Partial | Chưa đổi — nên bật `enforce` sau vài ngày quan sát log sạch (`.env` `CSP_MODE=enforce`) |
| Tenant guard/RLS (cách ly dữ liệu giữa các tổ chức ở tầng DB) chưa rollout | Partial | `.env` hiện `TENANT_GUARD_MODE=off`, `RLS_SET_CONFIG=false` — mặc định an toàn cho single-org, chỉ cần quan tâm nếu sau này có nhiều tổ chức dùng chung 1 server |
| Hai hệ Status song song (`status` legacy vs `statusId` mới) | Partial | Chưa cutover — filter/report vẫn dùng status legacy |
| Frontend bundle lớn (`exceljs` ~930KB, CSS ~810KB) | Remaining | Ảnh hưởng tốc độ tải lần đầu trên mạng yếu, chưa tối ưu |

### Tính năng tuỳ chọn CHƯA bật (không lỗi — chỉ chưa cấu hình)
- OmiCall (`OMICALL_ENABLED=false`) — xác nhận là nguyên nhân "kết nối omni bị lỗi" (2026-08-22). Hướng dẫn bật ở §6a.
- AI Assistant (`ANTHROPIC_AUTH_TOKEN` trống) — điền key nếu muốn dùng trợ lý AI.
- Telegram Bridge, Facebook Lead Ads, TikTok Lead Gen, Zalo Ads — tất cả optional, điền `.env` hoặc qua UI Settings khi cần.

---

## 10. Lệnh nhanh tham khảo (cheatsheet)

```bash
# SSH vào server
ssh root@14.225.222.26

# Xem trạng thái tất cả container
cd ~/zcrm && docker compose ps

# Xem log app realtime
docker logs -f zalo-crm-app

# Xem log app, chỉ lỗi
docker logs zalo-crm-app 2>&1 | grep -i error

# Restart app (đọc lại .env, KHÔNG build lại code)
docker compose restart app

# Kiểm tra health nhanh
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3080/

# Vào shell trong container app (debug)
docker exec -it zalo-crm-app sh

# Vào psql
docker exec -it zalo-crm-db psql -U crmuser -d zalocrm

# Xem dung lượng đĩa Docker đang dùng
docker system df

# Dọn image/build cache cũ không dùng (an toàn, KHÔNG đụng volume dữ liệu)
docker image prune -f
docker builder prune -f

# Xem đường dẫn thật của 1 volume trên đĩa
docker volume inspect zcrm_pg_data --format '{{.Mountpoint}}'
```

---

## 11. Sự cố thường gặp

Xem bảng đầy đủ ở §8
[`HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md`](./HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md#8-sự-cố-thường-gặp).
Ngắn gọn các lỗi hay gặp nhất:

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Đăng nhập lại bị đá về `/setup` | DB bị xoá do lỡ `docker compose down -v` | Restore từ `~/zcrm/backups/` (§5) |
| Paste lệnh vào SSH terminal báo `command not found` | Bracketed-paste bị hỏng khi dán khối nhiều lệnh nối `&&` | Chạy **từng lệnh một dòng** thay vì dán cả khối |
| App không kết nối được DB sau khi đổi `DB_PASSWORD` trong `.env` | Postgres không tự đổi mật khẩu theo `.env` sau lần init đầu (xem §0.3) | Đổi lại `.env` về mật khẩu cũ, hoặc backup+`down -v`+restore nếu bắt buộc phải đổi |
| Sau bật `ufw enable` không SSH vào được nữa | Quên `ufw allow 22/tcp` trước khi enable | Vào qua console VPS (web console của nhà cung cấp, không qua SSH) → `ufw allow 22/tcp` |
