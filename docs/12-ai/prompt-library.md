# Prompt library

## Audit

“Inspect implementation, tests, schema/config và runtime nếu được phép. Không sửa code. Liệt kê Issue/Evidence/Root Cause/Risk/Fix/Verification/Status; ghi UNKNOWN thay vì đoán.”

## Cross-system change

“Xác định system of record và owner trước. Trace sender→auth→receiver→idempotency→DB→retry/dead-letter. Test duplicate, timeout, unauthorized và partial failure ở cả hai repo.”

## Data migration

“Review schema/data distribution, tạo additive migration + dry-run/backfill, backup/rollback, constraint/index và post-migration queries. Không dùng reset/db push destructive.”

Prompt là checklist khởi đầu; source/test/runtime vẫn quyết định truth.
