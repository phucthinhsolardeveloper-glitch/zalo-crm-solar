# AI, webhook và provider khác

## AI/RAG

Source có Anthropic, Gemini và OpenAI-compatible registry, config/model theo org cùng RAG document/chunk/log trong DB. Trước khi bật cần xác định loại dữ liệu được gửi, consent, tenant isolation, prompt-injection boundary, provider retention, cost/quota, timeout/fallback và audit/redaction. Trạng thái credential/model production là `UNKNOWN`.

## Webhook và automation

Webhook outbound/inbound phải có signature/secret, timestamp/replay protection, stable event ID, timeout, retry/backoff, idempotent receiver và quan sát failed delivery. Automation production đang disabled ở snapshot; code tồn tại không chứng minh workflow đang hoạt động.

## Ads và tiện ích khác

Facebook/TikTok/Zalo OA models/config tồn tại, nhưng một số main worker/route phụ thuộc `_ee` không có trong repository quan sát được. Google Sheets, Zapier-style webhook và Firebase-related code cũng tồn tại; runtime credential, contract và support status đều `NEEDS VERIFICATION`.

Không đưa integration vào release-critical path nếu chưa có owner, contract test, kill switch và runbook. Khi bật, test 401/403, invalid signature, replay/duplicate, 429/5xx, timeout, partial failure và data isolation theo org.
