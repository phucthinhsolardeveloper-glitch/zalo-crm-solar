# Git workflow

Quy trình thực dụng từ thay đổi local đến nhánh remote. Ví dụ dùng repository ZCRM và nhánh `master01`.

## 1. Kiểm tra trước khi sửa

```powershell
$repo = 'D:\IT\zalo-crm-solar'
git -C $repo branch --show-current
git -C $repo status --short
git -C $repo remote -v
git -C $repo log -5 --oneline
```

Không overwrite thay đổi chưa rõ nguồn. Không dùng `git reset --hard` hoặc force-push theo thói quen.

Nếu Git báo `dubious ownership`:

```powershell
git -c safe.directory=D:/IT/zalo-crm-solar -C $repo status
```

## 2. Tạo nhánh mới

```bash
git fetch origin --prune
git branch --list master01
git ls-remote --heads origin master01
git switch -c master01
```

Đợt documentation này tạo `master01` từ `fix/omicall-sip-call-history`. Khi mở PR phải chọn base branch có chủ đích để không kéo thay đổi ngoài phạm vi.

## 3. File không được push

- `.env`, credential hoặc private key.
- Database dump/backup, customer export.
- Log, upload/media runtime, `node_modules`, `dist`, cache.
- Bundle `D:\IT\UpCloud` vì nằm ngoài repository.

`.env.example`, migration SQL và legacy archive đã kiểm kê/redaction có thể được commit.

```bash
git status --short --ignored
git ls-files '.env*'
git ls-files | rg '(^|/)(backups?|uploads?|logs?|dist|node_modules)/|\.(sql|dump|log)$'
```

Ngừng track nhưng giữ file local:

```bash
git rm --cached -- path/to/file
```

Sau đó thêm path vào `.gitignore`. File vẫn còn trong lịch sử cũ nếu từng được commit.

## 4. Review và stage

```bash
git status --short
git diff --stat
git diff --name-status
git add -A
git diff --cached --stat
git diff --cached --name-status
git diff --cached --check
```

Sau stage, Git mới nhận diện chính xác các legacy file chuyển sang `_archive/` là rename. Nếu không muốn stage toàn bộ:

```bash
git add README.md AGENTS.md CLAUDE.md docs/ _archive/
git add -p
```

## 5. Kiểm tra và commit

Chạy test/typecheck/build phù hợp, kiểm staged diff không có secret/backup rồi commit:

```bash
git commit -m "docs: reconstruct verified project knowledge"
git log -1 --oneline
git status --short
```

## 6. Push và xác minh

```bash
git push -u origin master01
git rev-parse HEAD
git ls-remote --heads origin master01
git branch -vv
git status --short
```

Hoàn tất khi local SHA khớp remote SHA, branch track `origin/master01` và working tree sạch.

## 7. Pull request

```bash
git fetch origin --prune
git log --oneline origin/main..origin/master01
git diff --stat origin/main...origin/master01
```

Kiểm base commit/branch trước khi tạo PR. PR ghi scope, test, migration/config impact, known issue và rollback.

## 8. Hoàn tác và lỗi thường gặp

```bash
git restore --staged path/to/file  # bỏ stage, giữ thay đổi local
git revert <commit-sha>            # hoàn tác commit đã chia sẻ
```

- `non-fast-forward`: fetch và so divergence; không tự force-push.
- `.git/*.lock` hoặc permission: kiểm process/quyền, không xóa lock mù quáng.
- Network/GitHub 443: giữ local commit và push lại khi kết nối phục hồi.
- LF/CRLF warning: kiểm diff; không trộn bulk line-ending change vào feature commit.
