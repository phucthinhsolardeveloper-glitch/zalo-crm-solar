# Backup và restore

## Phân loại: PARTIAL

**IMPLEMENTED:** Compose `backup` dùng `prodrigestivill/postgres-backup-local`, bind `./backups` và chạy `@daily`. Sau mỗi backup thành công, hook `scripts/prune-backups.sh` gom các file `daily/weekly/monthly/last` có cùng SHA-256 thành một snapshot và chỉ giữ đúng 2 snapshot mới nhất. Backup shell, PowerShell và pre-upgrade cũng áp dụng cùng giới hạn 2 bản. Production từng ghi file thành công 2026-08-23 và 2026-08-24; file ngày 24 có 60,354 byte và log `SQL backup created successfully`.

**IMPLEMENTED:** `scripts/backup-postgres.sh`, `.ps1` và deploy script có manual/pre-upgrade dump. Local workspace cũng có một SQL backup ngày 2026-08-18.

**DOCUMENTED_ONLY:** `scripts/restore-postgres-test.sh` tạo DB test, restore gzip, đếm table và sample 3 bảng.

**NOT VERIFIED:** chưa chạy restore rehearsal trong đợt audit này; chưa có checksum/off-host copy/alert khi backup fail; chưa có backup rõ ràng cho local file volume, MinIO object data hoặc secret/config. Backup DB một mình không khôi phục media/recording.

## Restore rehearsal yêu cầu

1. Chọn backup gần nhất và kiểm checksum/non-zero.
2. Tạo DB/staging cô lập, không restore đè production.
3. Restore, chạy migration status, đếm bảng/core rows và kiểm FK/domain invariant.
4. Khởi động app staging với bản sao media/config an toàn; smoke login/contact/chat/call metadata.
5. Ghi RTO/RPO và xoá môi trường test có kiểm soát.

Không đánh dấu backup strategy `IMPLEMENTED` đầy đủ trước khi bước này pass.
