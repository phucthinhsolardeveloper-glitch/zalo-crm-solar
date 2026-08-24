# Incident response

1. Xác định phạm vi: app, DB, Redis, storage, provider, auth hay data integrity; ghi timestamp/timezone và commit.
2. Bảo toàn bằng chứng: `docker compose ps`, log có giới hạn, health, migration status, metric/DB read-only query. Không paste secret/customer content.
3. Giảm tác động: tắt feature/provider bằng config an toàn, stop deploy, fail closed cho dữ liệu nhạy cảm; không xoá volume.
4. Nếu data risk: đóng write path, tạo snapshot/dump, xác định org/row bị ảnh hưởng.
5. Khôi phục theo rollback/restore đã diễn tập; verify DB + API + UI + jobs.
6. Ghi root cause, timeline, impact, corrective action và cập nhật canonical docs/test.

Các lệnh phá huỷ hoặc restore đè production cần phê duyệt rõ và backup xác nhận. Contact/escalation owner hiện `UNKNOWN`.
