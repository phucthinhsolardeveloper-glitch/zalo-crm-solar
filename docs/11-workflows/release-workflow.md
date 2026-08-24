# Release workflow

CI/CD chưa tồn tại; release là quy trình có người vận hành và phải lưu evidence. Production snapshot không tự động bảo đảm release tiếp theo an toàn.

## Gate trước release

- Intended diff và version/change note đã review; không lẫn user change/artifact.
- Backend tests + typecheck, frontend tests + vue-tsc + production build đạt trong môi trường phù hợp.
- Migration SQL/index/constraint/data compatibility và expand–migrate–contract order đã review.
- Env diff chỉ so key/contract, không in secret; provider credential, quota, webhook và kill switch đã xác minh.
- Có pre-deploy backup non-zero và restore confidence. Restore rehearsal production-like hiện chưa được chứng minh nên vẫn là blocker.
- Ghi release SHA/image, rollback target, owner, maintenance window và acceptance smoke.

## Triển khai và smoke

Theo `docs/06-operations/deployment.md`: preflight health/disk/backup, build đúng target, chạy `prisma migrate deploy`, restart, kiểm process/health/migration/log. Smoke login/refresh, contacts, chat send/receive/history/media, Zalo reconnect, quyền cross-org; chỉ smoke telephony/Telegram/AI khi integration được bật và có môi trường kiểm thử an toàn.

## Theo dõi

Theo dõi 5xx/429, DB/Redis/storage health, disk, queue/cron last-success, Zalo reconnect/rate limit, OmiCall webhook/history/relay và backup output. Khi acceptance fail, dừng rollout; rollback code hoặc forward-fix schema theo runbook. Không dùng `docker compose down -v`, reset DB hoặc restore đè production thiếu phê duyệt.

Release note phải ghi migration/config, verification, known issue và quyết định rollback. OmiCall disabled, HTTP/no domain, CSP report-only, tenant guard/RLS off và restore chưa diễn tập vẫn là các readiness condition phải xử lý riêng.
