# Integrations

Integration là ranh giới failure/security riêng, không chỉ là một config flag. Mọi thay đổi phải xác định owner, credential scope, contract/version, identity/idempotency, timeout/retry, rate limit, observability, data retention và kill switch.

## Danh mục canonical

- [Zalo/ZCA](zalo.md): QR/session, listener/reconnect, chat/friend/contact và provider failure.
- [OmiCall/ZCC](omicall.md): SIP/WebRTC, webhook/history, CDR/recording/provisioning.
- [CRM Custom boundary](crm-custom-boundary.md): ownership và terminal-call relay giữa hai repo.
- [Telegram bridge](telegram.md): Bot API/MTProto và mapping thread↔topic.
- [Storage và antivirus](storage-antivirus.md): local/R2/MinIO, public/private media và ClamAV.
- [AI, webhook và provider khác](ai-webhooks-other.md): model registry, RAG, outbound webhook và các integration chưa đủ runtime evidence.

## Trạng thái production snapshot 2026-08-24

Storage driver là `local`; ClamAV bật fail-closed; OmiCall và ZCC disabled. Trạng thái credential/runtime của Zalo, Telegram, AI, ads và webhook riêng lẻ không được suy ra từ việc có code/config. Mọi snapshot phải được kiểm lại trước release.

Integration chưa có test contract/negative path hoặc runtime evidence phải ghi `NEEDS VERIFICATION`; provider quota/SLA/capacity chưa benchmark phải ghi `UNKNOWN` hoặc `CAPACITY NOT YET BENCHMARKED`.
