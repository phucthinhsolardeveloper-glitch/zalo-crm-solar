# Debugging workflow

1. Reproduce với timestamp, user/org/role, request/call ID nhưng không log secret/content dư thừa.
2. Xác định layer: browser → API → middleware → service → DB/Redis/storage/provider.
3. So sánh expected với code/test/runtime, không tin comment cũ.
4. Tạo minimal failing test/query; phân loại `PRE_EXISTING|REGRESSION|ENVIRONMENT|REAL_BUG|UNKNOWN`.
5. Fix root cause ở owner module; chạy regression layers và kiểm log/side effect.
6. Nếu production incident, theo incident runbook và bảo toàn evidence.
