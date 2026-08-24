# Documentation completeness reverse-audit — 2026-08-24

## Kết luận

Legacy đã được bảo tồn và các fact cốt lõi đã có canonical home. Tuy nhiên canonical docs hiện ở mức **đủ để hiểu hệ thống và tiếp tục phát triển an toàn**, chưa phải full API/user/operations manual tự chứa toàn bộ payload, response, từng màn hình và mọi tình huống vận hành.

## Phương pháp

Đã đối chiếu 67 legacy source của ZCRM, trong đó 41 text document khoảng 12.459 dòng/1.013 heading, với root docs và 60 Markdown file canonical khoảng 2.061 dòng/285 heading. Phần legacy lớn gồm hai API manual gần trùng nhau, Postman, changelog, implementation plan, screenshot/diagram và runbook chứa snapshot/secret-like value; không dùng line count làm completeness gate.

## Đã chuyển đầy đủ hoặc thay thế tốt hơn

- Project, stack, repository, frontend/backend component và request/data/dependency flow.
- Schema/migration/data safety và ownership ZCRM↔CRM Custom.
- Auth lifecycle hiện tại: access 15 phút, refresh 30 ngày/family 90 ngày/reuse grace 20 giây.
- Route catalog 375 literal Fastify route theo 55 area/source file; legacy token/base URL claim được loại.
- Zalo session/chat/friend/contact, OmiCall CDR/history/recording/relay, Telegram, storage/AV và AI/webhook boundary.
- Docker services/volume/health, backup classification, production snapshot và production blockers.
- Security/RBAC/tenant/CSP/RLS state, testing baseline và AI workflow.
- Crosswalk cho root guide, architecture 00–16, API artifacts, production guide, handoff, release image và OmiCall plan/spec.

## Được cô đọng hợp lý, không mất khỏi hệ thống

- Hai API manual Anh/Việt và Postman giữ nguyên trong archive; canonical route catalog dựa trên source vì manual chứa claim đã drift.
- Changelog 603 dòng, release screenshot v3.3/v3.4 và handoff giữ làm history; current behavior lấy từ code/test/runtime.
- OmiCall implementation plan 907 dòng và design specs giữ làm design history; canonical telephony/integration chỉ ghi phần đã có implementation và blocker.
- Cloudflare/R2/Telegram/VPS guide giữ trong archive; canonical không chép credential, domain, firewall hoặc provider state chưa xác minh.

## Khoảng trống canonical còn thật

1. **API contract chi tiết — PARTIAL:** route catalog chưa chứa request schema, response/status/error và example cho từng route; dynamic registration ngoài 375 literal route cần kiểm thêm.
2. **Local setup/troubleshooting — PARTIAL:** có Docker/hybrid/first-run và command nền, nhưng chưa tái kiểm bằng máy sạch có Docker; Node mismatch, setup redirect và service-specific failure chưa được viết thành tested troubleshooting matrix.
3. **Production runbook — PARTIAL:** có deploy/preflight/snapshot nhưng ngắn hơn legacy VPS guide; domain/TLS/firewall/provider enabling và restore procedure chưa thể canonical hóa đầy đủ vì chưa triển khai/diễn tập.
4. **Feature manual — PARTIAL:** route/flow cốt lõi có, nhưng automation, analytics/report, privacy, customer-list/campaign và AI/RAG chưa có user/operator guide riêng.
5. **WebSocket/realtime contract — PARTIAL:** architecture mô tả Socket.IO nhưng chưa có canonical event catalog/payload/reconnect semantics đầy đủ.
6. **Release history navigation — PARTIAL:** changelog cũ được archive nhưng canonical changelog chưa có index liên kết từng release/screenshot lịch sử.

## Bằng chứng archive

59/67 file ZCRM giống Git blob; tám file khác do security redaction. Cộng hai file redacted thuộc `IT-root`, inventory ghi tổng 10 file redacted cho hai provenance. Bundle UpCloud được kiểm hash sau copy, không thiếu file.

## Tiêu chí đóng audit

Cần sinh API và realtime contract từ source/schema/test, chạy clean-machine setup, viết operator guide cho feature còn thiếu, diễn tập restore và bổ sung production/TLS/firewall evidence. Cho tới lúc đó trạng thái đúng của documentation completeness là `VERIFIED_PARTIAL`, không phải `COMPLETE`.
