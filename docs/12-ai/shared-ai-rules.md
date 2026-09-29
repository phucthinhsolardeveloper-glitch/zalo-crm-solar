# AI workflow addendum

Các rule bổ sung được đồng bộ từ quy trình vận hành dùng chung. Nguồn có hiệu
lực là `AGENTS.md`; file này chỉ là lối vào ngắn cho agent mới.

- Đọc `AGENTS.md` và context map trước khi làm.
- Dùng vòng lặp inspect → understand → plan → implement → test → verify → document → report.
- Phân loại rủi ro, checkpoint task dài, đo disk trước cleanup và giữ rollback point.
- Không ghi hội thoại/người dùng/AI vào comment source.
- Sau milestone lớn hoặc bảo trì, cập nhật canonical docs và lịch sử.
