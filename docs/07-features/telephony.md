# Telephony

## Mục tiêu và ownership

ZCRM sở hữu orchestration cuộc gọi: WebSDK/SIP trong browser, credential theo user, webhook/history sync, CDR `TelephonyCall`, ghi chú theo phone, recording mirror và relay terminal CDR sang `crm-custom`. CRM Custom dùng event đó để liên hệ với Lead/Customer nghiệp vụ; không tự trở thành owner của SIP session hoặc recording pipeline.

## Luồng outbound/inbound

1. User có cấu hình telephony hợp lệ tải bootstrap/config qua API protected.
2. Frontend khởi tạo OmiCall WebSDK, đăng ký SIP và phát/nhận call event.
3. Provider webhook và history sync hợp nhất call state vào `TelephonyCall`; `call_uuid` là identity quan trọng.
4. Terminal state có thể kích hoạt lấy/mirror recording, gắn note/context theo phone và relay best-effort sang CRM Custom.
5. UI đọc lịch sử/trạng thái từ DB/API thay vì chỉ tin transient SDK event.

Credential SIP theo user được mã hóa khi lưu. Global API/webhook/relay secret đến từ environment và không được ghi vào log/docs. Public webhook phải xác thực theo implementation/provider contract; quyền truy cập call/history/recording cần grant matrix rõ ràng.

## Idempotency và failure behavior

Webhook, browser SDK và polling/history có thể cùng báo một cuộc gọi. Upsert/merge phải dùng stable call identity và không tạo CDR/relay lặp. History sync chỉ relay khi record thực sự mới hoặc đổi để tránh gây 429 ở receiver. Relay terminal CDR là best-effort: lỗi receiver được log warning và không làm provider webhook thất bại, nên cần cơ chế quan sát/retry/reconciliation riêng nếu yêu cầu không mất event.

Recording là dữ liệu nhạy cảm: private access, encryption/mirror retention, hai chiều audio và authorization phải được kiểm chứng end-to-end. Legacy audit từng ghi nhận mono/single-party symptom; trạng thái hai-party audio hiện `NEEDS VERIFICATION`.

## Trạng thái và gate

Ở production snapshot 2026-08-24, OmiCall/ZCC flag đang disabled. Source có auto-provisioning nhưng lifecycle disable/reactivate, mapping role/grant và provider state reconciliation chưa đủ bằng chứng. Telephony vì vậy chưa được coi production-ready.

Verification tối thiểu gồm outbound/inbound/decline/missed/hangup, duplicate webhook/history, recording hai phía, unauthorized/cross-org, SIP credential revoke, relay timeout/401/429/duplicate và restart/reconciliation. Xem `docs/08-integrations/omicall.md` và `docs/08-integrations/crm-custom-boundary.md`.
