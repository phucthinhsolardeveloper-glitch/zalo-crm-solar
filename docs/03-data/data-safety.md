# Data safety

- Không dùng `docker compose down -v`, xoá named volume, `prisma migrate reset`, `db push --accept-data-loss` trên dữ liệu cần giữ.
- Backup DB + file/object storage + `.env`/secret escrow trước deploy có migration.
- Không đổi `DB_PASSWORD` chỉ trong `.env` sau khi volume Postgres đã init; phải đổi cả DB role theo quy trình.
- Migration nên additive; destructive cutover cần dual-read/write, backfill, metric và rollback rehearsal.
- Mọi backfill phải scope `orgId`, idempotent, batch, log count và có dry-run khi tác động rộng.
- Không copy production DB sang dev không redaction.
- Redis AOF giúp queue recovery nhưng không thay database backup; noeviction có thể làm write/job fail khi đầy.
- `backups/` trong repo workspace có thể chứa dữ liệu thật; đang git-ignore và không được đưa vào archive/docs.
