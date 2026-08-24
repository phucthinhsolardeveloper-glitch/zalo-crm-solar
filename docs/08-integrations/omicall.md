# OmiCall/ZCC integration

## Thành phần

- Browser WebSDK/SIP cho register, outbound và inbound call.
- Agent/Directory/Call Transaction/recording client phía backend.
- Public webhook và history sync để hợp nhất CDR.
- Credential SIP theo user được mã hóa; global API/webhook secret lấy từ environment.
- Recording mirror/private delivery và optional terminal-event relay sang `crm-custom`.

## State convergence

Một call có thể xuất hiện từ SDK event, webhook và polling/history. `call_uuid`/provider identity phải là khóa hội tụ; merge không được tạo call/relay lặp hoặc hạ terminal state về state cũ. History sync chỉ forward khi record mới hoặc thay đổi nhằm giảm duplicate/429.

Webhook cần xác thực đúng contract và trả response đủ nhanh; công việc chậm như recording/relay nên có failure observability. Relay CRM là best-effort hiện tại, vì vậy warning log không đồng nghĩa event đã được retry/reconciled.

## Security và privacy

Không trả SIP secret cho user không sở hữu/không được cấp quyền. Recording cần private authorization, encryption/retention và audit; URL public lâu dài là không phù hợp. Grant matrix theo role/org/owner chưa hoàn chỉnh là blocker.

## Provisioning và trạng thái

Source có auto-provisioning nhưng mapping role/grant, disable/reactivate, vendor drift và cleanup khi user nghỉ cần xác minh. Production snapshot 2026-08-24 có OmiCall/ZCC disabled, nên không được tuyên bố live chỉ dựa trên code.

## Verification matrix

Outbound/inbound/decline/missed/hangup; duplicate/out-of-order webhook; history reconciliation; SIP revoke; unauthorized/cross-org; vendor 401/429/5xx; recording hai phía; relay timeout/duplicate/recovery. Cần test thật hai đầu audio và kiểm file playback, vì legacy evidence từng phản ánh chỉ một phía.
