# Claude Code Entry Point

1. Đọc `AGENTS.md`; đây là rulebook dùng chung và có ưu tiên hơn file này.
2. Dùng `docs/12-ai/context-map.md` để chỉ nạp context cần thiết cho task.
3. Kiểm tra implementation/config/schema/test thật trước khi tin tài liệu hoặc conversation memory.
4. Ghi kiến thức tái sử dụng vào canonical docs; không biến handoff/chat thành source of truth.
5. Báo cáo tiến độ, cảnh báo, kết luận và đề xuất cho user bằng tiếng Việt.

Project knowledge bắt đầu tại `docs/README.md`. File này chỉ routing cho Claude, không lặp lại quy tắc hoặc kiến trúc.
