# Git workflow — từ thay đổi local đến nhánh remote

Tài liệu này mô tả quy trình Git an toàn đã dùng khi tái dựng documentation và tạo nhánh `master01`. Áp dụng cho code, migration và docs; thay tên nhánh/remote theo task thực tế.

## 1. Khái niệm và nguyên tắc

```text
working tree → staging/index → local commit → remote branch → pull request → merge
```

- Working tree chứa file đang sửa; staging là nội dung chính xác sẽ vào commit.
- `git status` phải chạy trước và sau mỗi giai đoạn quan trọng.
- Thay đổi có sẵn nhưng chưa rõ nguồn được xem là của người dùng; không revert/overwrite.
- Không commit `.env`, credential, database dump, log, upload runtime, `node_modules`, `dist`, cache hoặc backup local.
- `.env.example`, Prisma migration và `.gitkeep` có thể được commit nếu không chứa secret/data thật.
- Không dùng `git reset --hard`, `git checkout -- <file>` hoặc force-push nếu chưa có yêu cầu và recovery plan.

## 2. Xác nhận đúng repository và nhánh nền

PowerShell:

```powershell
$repo = 'D:\IT\zalo-crm-solar'
git -C $repo rev-parse --show-toplevel
git -C $repo branch --show-current
git -C $repo status --short
git -C $repo remote -v
git -C $repo log -5 --oneline --decorate
```

Nhánh `master01` của đợt documentation được tạo từ `fix/omicall-sip-call-history` tại commit `6c7e99c`. Không chuyển nhánh khi working tree có thay đổi chưa hiểu.

Nếu Git báo `dubious ownership`, ưu tiên option chỉ cho từng lệnh:

```powershell
git -c safe.directory=D:/IT/zalo-crm-solar -C D:\IT\zalo-crm-solar status
```

## 3. Fetch và kiểm nhánh đích

```bash
git fetch origin --prune
git branch --list master01
git branch -r --list origin/master01
git ls-remote --heads origin master01
```

Nếu remote đã có branch, không push đè. Checkout tracking sau khi xác minh owner:

```bash
git switch --track origin/master01
```

Nếu chưa tồn tại:

```bash
git switch -c master01
```

## 4. Kiểm file không được push

```bash
git status --short --ignored
git check-ignore -v .env
git ls-files '.env*'
git ls-files | rg '(^|/)(backups?|uploads?|logs?|dist|node_modules)/|\.(sql|dump|log)$'
```

`.env.example`, `backend/.env.example` và migration SQL là source/config contract có thể track sau secret review. `.env`, production secret, DB dump, `backups/`, upload/media runtime và container volume không được commit.

Legacy archive Markdown/PDF/Postman/screenshot/diagram trong đợt này là artifact có chủ đích và được push sau inventory, redaction và hash verification. Bundle `D:\IT\UpCloud` nằm ngoài repository nên không đi theo Git push.

Nếu một file nhạy cảm đã được track nhưng phải giữ trên máy:

```bash
git rm --cached -- path/to/file
```

Thêm path vào `.gitignore`, rồi commit deletion. Việc này không xóa blob khỏi history; credential phải rotate và history cleanup cần task riêng.

## 5. Review trước stage

```bash
git status --short
git diff --stat
git diff --name-status
git diff -- README.md
```

`git diff` không hiển thị nội dung untracked. Trước stage, việc chuyển legacy có thể hiện hàng chục `D` và `??`, tạo cảm giác xóa dữ liệu dù file đã nằm ở archive.

## 6. Stage và nhận diện rename

Stage toàn bộ khi toàn bộ working tree nằm trong scope:

```bash
git add -A
```

Hoặc chọn lọc:

```bash
git add README.md AGENTS.md CLAUDE.md docs/ _archive/
git add -p
```

Kiểm index:

```bash
git status --short
git diff --cached --stat
git diff --cached --name-status
git diff --cached --check
```

Sau stage, Git đã nhận diện phần lớn legacy ZCRM là rename 97–100%, thay vì deletion. Rename detection là presentation theo similarity; inventory/count/hash vẫn là verification độc lập.

Không commit nếu staged diff chứa `.env`, secret, dump, customer export, runtime upload, build/cache hoặc thay đổi ngoài scope. Trong đợt này, comment-only edit có sẵn ở `backend/src/modules/telephony/telephony-routes.ts` được giữ và đưa vào commit vì người dùng yêu cầu push toàn bộ working tree.

## 7. Verification trước commit

Chạy test/typecheck/build theo `testing.md`, link/secret scan cho docs và review migration/provider/security theo phạm vi. Phân loại failure; không coi build pass là đủ.

```bash
git diff --cached --check
git diff --cached --stat
git diff --cached --name-status
```

## 8. Commit

```bash
git commit -m "docs: reconstruct verified project knowledge"
git log -1 --oneline --decorate
git status --short
```

Commit nên có một mục tiêu reviewable. Không amend commit đã push nếu người khác có thể dựa vào nó, trừ khi team thống nhất rewrite.

## 9. Push nhánh mới

Xác nhận remote là đích tin cậy và payload được phép rời máy:

```bash
git remote -v
git push -u origin master01
```

`-u` tạo upstream. Nhánh feature được push không tự merge vào nhánh fix hoặc `main`.

Nếu remote tiến trước:

```bash
git fetch origin
git log --oneline --left-right HEAD...origin/master01
```

Dừng và review. Khi được phép rebase:

```bash
git rebase origin/master01
```

Giải conflict, chạy lại test và push bình thường. Chỉ dùng `--force-with-lease` khi rewrite đã được thống nhất; không dùng `--force` theo thói quen.

## 10. Xác minh remote sau push

```bash
git rev-parse HEAD
git ls-remote --heads origin master01
git status --short
git branch -vv
```

Acceptance:

```text
local HEAD == origin/master01 SHA
working tree clean
branch tracks origin/master01
```

Đợt reconstruction đầu tiên của ZCRM tạo commit `3385b7f`; SHA là snapshot lịch sử và sẽ đổi khi có commit mới.

## 11. Pull request và merge

Tạo PR từ `master01` vào nhánh đích do owner chọn; vì `master01` bắt đầu từ `fix/omicall-sip-call-history`, cần review base branch cẩn thận trước khi mở PR vào `main` để không kéo thay đổi ngoài ý muốn.

```bash
git fetch origin --prune
git log --oneline origin/main..origin/master01
git diff --stat origin/main...origin/master01
git diff --name-status origin/main...origin/master01
```

PR ghi scope, base commit, code/migration/config/docs impact, verification, known issues và rollback. Không xóa nhánh trước merge. Sau merge, chỉ xóa local/remote khi được yêu cầu và không còn consumer.

## 12. Hoàn tác an toàn

Đã stage nhưng muốn giữ file local:

```bash
git restore --staged path/to/file
```

Commit shared/pushed cần hoàn tác bằng commit mới:

```bash
git revert <commit-sha>
```

Không dùng `git reset --hard` để xử lý working tree không rõ ownership. `git revert` code cũng không tự rollback migration/data; cần kế hoạch riêng.

## 13. Troubleshooting

- `dubious ownership`: dùng `-c safe.directory=<exact-repo>` và xác minh path/owner.
- `cannot lock ref ... Permission denied`: kiểm quyền ghi `.git` hoặc sandbox; không xóa `.lock` khi Git khác có thể đang chạy.
- GitHub port 443/network failure: kiểm network/proxy/VPN; local commit vẫn an toàn, push lại khi kết nối phục hồi.
- Authentication failure: dùng credential manager/token/SSH; không dán token vào docs hoặc command history.
- `non-fast-forward`: fetch và so divergence; không force.
- Rename không nhận: stage cả path cũ/mới rồi kiểm `git diff --cached --summary`.
- LF/CRLF warning: kiểm `.gitattributes`; không trộn bulk line-ending normalization với feature commit.
- File lớn bị reject: đánh giá có phải source artifact không; không đưa backup/runtime data vào LFS chỉ để vượt giới hạn.

## 14. Chuỗi lệnh rút gọn đã dùng

```bash
git status --short
git remote -v
git branch --list master01
git ls-remote --heads origin master01
git switch -c master01
git add -A
git diff --cached --stat
git diff --cached --name-status
git commit -m "docs: reconstruct verified project knowledge"
git push -u origin master01
git rev-parse HEAD
git ls-remote --heads origin master01
git status --short
```

Giữa stage và commit phải chạy verification/review. Không copy chuỗi này chạy mù quáng trên working tree có thay đổi không thuộc task.
