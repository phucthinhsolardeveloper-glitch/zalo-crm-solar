# Backup và restore

## Phân loại: PARTIAL

**IMPLEMENTED (DB-only, GFS):** Compose service `backup` dùng
`prodrigestivill/postgres-backup-local`, bind `./backups`, chạy `@daily`.
`scripts/prune-backups.sh` giữ **riêng số lượng theo từng bucket**
(`daily/weekly/monthly/last`), không còn gộp chung 1 số như trước:
`BACKUP_KEEP_DAILY=7`, `BACKUP_KEEP_WEEKLY=4`, `BACKUP_KEEP_MONTHLY=6`,
`BACKUP_KEEP_LAST=1` (env trong `docker-compose.yml`, chỉnh được). Cùng nội
dung xuất hiện ở nhiều bucket (vd bản Chủ Nhật vừa là daily vừa là weekly)
được hash-collapse thành hard link — không nhân bản dung lượng.

**⚠️ Sự cố đã phát hiện + vá (2026-09-30):** container `backup` đã **không
chạy trong hơn 1 tháng** (backup tự động gần nhất trước đó là 2026-08-29) dù
service đã định nghĩa sẵn — do bị liệt vào nhóm "tuỳ chọn, không tự bật" trong
`scripts/zalocrm-deploy.sh` (`CORE_SERVICES`). Đã start lại + thêm `backup`
vào `CORE_SERVICES` để các lần deploy sau không tắt lại. Đã chạy tay 1 lần để
verify hook mới hoạt động đúng (daily/weekly/monthly/last đều ghi và prune
theo giới hạn riêng).

**IMPLEMENTED (đầy đủ: DB + media + config, GFS, 2026-09-30):**
`scripts/backup-full.sh` — mỗi lần chạy tạo 1 set gồm `db.sql.gz` + `media.tar.gz`
(toàn bộ volume `file_storage`) + `config.tar.gz` (.env, docker-compose.yml,
chmod 600) + `checksums.sha256`. Set luôn vào `backups/full/daily/<timestamp>/`;
nếu đúng Chủ Nhật (`BACKUP_WEEKLY_ISO_DOW`, mặc định 7) cũng hard-link
(`cp -al`) vào `weekly/`; nếu ngày 1 đầu tháng (`BACKUP_MONTHLY_DOM`, mặc định
1) cũng hard-link vào `monthly/`. Retention riêng từng bucket:
`BACKUP_KEEP_DAILY=3 / WEEKLY=2 / MONTHLY=2` (mặc định thấp hơn DB-only vì
media nặng — env chỉnh được). Đã chạy thật 2 lần, verify checksum khớp, tổng
~5.2GB/set. **Lên lịch cron host:** `30 2 * * *` (crontab user chạy app),
log ra `backups/logs/backup-full-cron.log`.

**IMPLEMENTED:** `scripts/backup-postgres.sh`, `.ps1` và deploy script có manual/pre-upgrade dump. Local workspace cũng có một SQL backup ngày 2026-08-18.

**IMPLEMENTED + LOCALLY VERIFIED (2026-09-30):** `scripts/restore-postgres-test.sh` tạo DB test cô lập, restore gzip với `ON_ERROR_STOP`, đếm table và sample 3 bảng; mặc định tự dọn DB tạm (`KEEP_TEST_DB=1` nếu cần giữ để inspect). Backup `backups/last/zalocrm-20260829-003833.sql.gz` đã restore thành công `114` bảng, `contacts=3982`, `conversations=308`, `messages=34179`. Script lọc riêng `SET transaction_timeout` để backup tạo từ client mới hơn vẫn restore được trên PostgreSQL 16.

**NOT VERIFIED:** off-host copy (`BACKUP_OFFHOST_DIR` có nhánh code nhưng chưa cấu hình đích thật — toàn bộ backup hiện vẫn nằm chung ổ đĩa với dữ liệu gốc); alert khi backup fail; restore rehearsal cho nhánh media/config (chỉ nhánh DB đã restore-test); khởi động app với media/config sau restore end-to-end.

## Restore rehearsal yêu cầu

1. Chọn backup gần nhất và kiểm checksum/non-zero.
2. Tạo DB/staging cô lập, không restore đè production.
3. Restore, chạy migration status, đếm bảng/core rows và kiểm FK/domain invariant.
4. Khởi động app staging với bản sao media/config an toàn; smoke login/contact/chat/call metadata.
5. Ghi RTO/RPO và xoá môi trường test có kiểm soát.

Không đánh dấu backup strategy `IMPLEMENTED` đầy đủ trước khi bước này pass.
