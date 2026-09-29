# Documentation workflow

## Nội dung canonical

1. Xác định canonical home theo `docs/README.md`; một fact có một owner, file khác link thay vì duplicate.
2. Thu bằng chứng theo runtime → test → code → schema/migration → config → canonical → legacy.
3. Gắn ngày cho runtime/số liệu biến động; dùng `UNKNOWN`, `NEEDS VERIFICATION`, `CAPACITY NOT YET BENCHMARKED` khi thiếu.
4. Mô tả đủ purpose, owner, flow, permission, failure mode, observability và verification. Ngắn chỉ hợp lệ nếu người đọc vẫn vận hành đúng mà không đoán.
5. Thay đổi architecture/schema/API/auth/RBAC/integration/deployment/user behavior phải cập nhật docs và `docs/CHANGELOG.md`.

## Archive và handoff

Legacy được giữ theo source project tại `_archive/legacy-docs/2026-08-24/`; không biến claim cũ thành truth hiện tại. Giữ nguyên văn non-secret, ghi inventory/redaction và re-verify trước khi đưa vào canonical. Handoff chỉ giữ context tạm; fact còn giá trị phải chuyển về owner doc.

## Quality gate

Kiểm link/anchor, path/command, secret pattern, boilerplate/file quá mỏng, số liệu snapshot, inventory/trackability và reverse-compare legacy liên quan. Không copy credential, `.env`, cookie, PII hay production payload vào tài liệu.

## Rà soát định kỳ

- Hàng tháng: rà soát runbook, backup/restore, disk/Docker, deploy và các
  command/path biến động.
- Sau milestone hoặc thay đổi lớn: cập nhật canonical docs trước khi đóng task.
- Hàng quý: kiểm link, số liệu snapshot, secret pattern, archive/handoff và
  reverse-compare với implementation.
