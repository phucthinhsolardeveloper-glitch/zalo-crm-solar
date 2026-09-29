# Shared AI rules — template dùng chung

## Quy trình

`INSPECT → UNDERSTAND → PLAN → IMPLEMENT → TEST → DEBUG → VERIFY → DOCUMENT → REPORT`

- Phân loại task trước khi làm: `docs-only`, frontend rủi ro thấp, backend/API,
  data/migration, security/infrastructure.
- Chọn mức triển khai nhỏ nhất phù hợp; không chạy quy trình nặng cho thay đổi
  nhỏ, nhưng không dùng đường nhanh để né test dữ liệu hoặc bảo mật.
- Tác vụ dài phải có checkpoint và log; không lặp lệnh khi chưa có chẩn đoán mới.
- Comment source chỉ ghi rationale kỹ thuật, invariant và giới hạn; không ghi lời
  hội thoại, tên AI hoặc trích dẫn người dùng.

## Backup, disk và container

- Đo trước bằng `df -h`, `du -x` và `docker system df -v`.
- Giữ current/previous/rollback; không xóa database volume, upload, secrets hoặc
  state reference.
- Chỉ prune cache/image không dùng sau khi đối chiếu container và rollback point.
- Không dùng lệnh dọn toàn hệ thống có thể xóa volume production khi chưa có kế
  hoạch khôi phục và phê duyệt rõ ràng.

## Tài liệu và skills

- Sau milestone lớn, migration, thay đổi kiến trúc/deploy hoặc bảo trì phải rà
  soát canonical docs và ghi lịch sử; không cần ghi real-time cho mọi thay đổi nhỏ.
- Báo cáo bằng tiếng Việt, nêu evidence, test đã/chưa chạy, unknown, rủi ro,
  rollback point và blocker production.
- Skills phụ thuộc môi trường AI; đọc danh sách skill và toàn bộ `SKILL.md` trước
  khi dùng. Không coi việc chép Markdown là đã cài skill.
