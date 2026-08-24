# Agent workflow

Agent tuân vòng lặp `INSPECT → UNDERSTAND → PLAN → IMPLEMENT → TEST → DEBUG → VERIFY → DOCUMENT → REPORT` và báo cáo tiếng Việt.

## Trước khi sửa

Đọc `AGENTS.md`, minimum context, code/test lân cận và `git status`. Xác định feature đã có chưa, owner nào chịu trách nhiệm, abstraction nào reuse được và thay đổi có tạo owner thứ hai không. Memory/chat/comment/legacy không phải truth nếu runtime/test/code mâu thuẫn.

## Giới hạn hành động

Ưu tiên diff nhỏ, reversible và đúng scope. Không tự commit/push/deploy, thay production data/secret/DNS/firewall, hoặc chạy destructive command. Không đưa `.env`, credential, cookie, customer content hoặc production payload vào chat/log/docs.

Task hai repo phải ghi system of record, event direction, identity/idempotency, authentication, timeout/retry/reconciliation, persistence và test ở sender/receiver. Không tạo Customer/Order/Payment owner thứ hai trong ZCRM.

## Verification và knowledge capture

Chạy verification theo `AGENTS.md`, gồm negative/cross-org khi chạm security. Phân loại failure, không tuyên bố success chỉ từ build. Reusable discovery phải vào canonical docs; handoff dùng đúng `DONE/VERIFIED/REMAINING/KNOWN ISSUES/RELEVANT FILES/NEXT`. Báo cuối phải nêu evidence, test đã/chưa chạy, unknown và production blocker.
