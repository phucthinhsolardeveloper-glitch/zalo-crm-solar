# Boundary with crm-custom

`zalo-crm-solar` sở hữu Zalo account/conversation và telephony orchestration/relay. `crm-custom` sở hữu Lead/Customer/Order/Payment và lưu call outcome như hoạt động CRM. Hai database không phải một system of record chung.

Luồng đã thấy trong code: khi cuộc gọi kết thúc, ZCRM gửi CDR best-effort tới dynamic webhook CRM; `call_uuid` là khóa idempotency. ZCRM không được coi CRM webhook thành công là điều kiện hoàn tất call nội bộ; CRM phải chống duplicate/out-of-order.

Snapshot 2026-08-24: production ZCRM có `OMICALL_ENABLED=false`; provisioning audit cho thấy chưa có telephony grant, audio hai chiều chưa verified. Vì vậy integration **không production-ready**.

Canonical phía đối tác: `D:/IT/crm-custom/docs/08-integrations/zalo-crm-solar.md`.
