# Coding workflow

1. Đọc `AGENTS.md`, context map và docs của subsystem.
2. `git status`; giữ nguyên thay đổi của user.
3. Truy vết owner hiện tại trước khi thêm module/route/model.
4. Viết acceptance và verification; với DB phải có migration/data-safety plan.
5. Implement nhỏ, reuse helper/service hiện có.
6. Chạy test mục tiêu, typecheck, build và smoke phù hợp.
7. Review auth/org/owner/grant trên mọi route mới.
8. Cập nhật canonical docs và changelog nếu behavior thay đổi.

Quy ước quan sát từ source: TypeScript ESM dùng import `.js` cho output; Prisma model map sang snake_case; route nằm theo domain module; logger dùng shared logger thay raw payload nhạy cảm.

Repository không có formatter/linter/CI config canonical. Style chi tiết ngoài bằng chứng hiện có là `UNKNOWN`; bám code lân cận và tránh bulk reformat.
