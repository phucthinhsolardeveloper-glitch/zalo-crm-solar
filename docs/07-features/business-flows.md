# Business flows

## Authentication và session

```text
LoginView → POST /api/v1/auth/login
→ auth service bcrypt/password policy
→ access JWT 15 phút + opaque refresh token
→ refresh hash/family lưu DB
→ frontend localStorage + Axios Bearer
→ 401 single-flight refresh/rotation → retry request
```

Refresh family TTL 30 ngày, max 90 ngày, reuse grace 20 giây. Setup owner và forced password change là flow riêng. Backend route guard mới là enforcement; router guard chỉ UX. Logout/reuse/rotation phải test multi-tab và stolen token.

## Contact CRUD và scope

Create/list/detail/update/delete/quick-create/duplicate merge đi từ Contacts view/composable tới contact routes. Prisma extension normalize phone/name; route/service áp org/contact visibility/editability và grant. Create/update có activity/webhook side effects theo path. Delete behavior/cascade phải kiểm schema/route hiện tại trước dùng vì Contact liên kết nhiều Friend/Conversation/Message/appointment/media records.

Contact là CRM aggregation; Friend là identity/status theo mỗi Zalo nick. Không gộp hai khái niệm. Dynamic `Status/statusId` và legacy status field đang cùng tồn tại; feature mới không ghi hai nguồn độc lập nếu chưa có cutover plan.

## Chat realtime

```text
Inbound: Zalo → zca-js listener → normalize/upsert Friend/Contact/Conversation/Message
→ aggregate/event buffer → Socket.IO org room → Chat UI

Outbound: Chat UI → REST send route + requireZaloAccess('chat')
→ Zalo pool/rate limiter → Message DB/aggregate → socket
```

Virtual conversation có nhánh lưu local/AI. Conversation có soft-delete/restore/tab/follow state. Zalo native edit/delete capability khác local model; không giả định mọi message mutation được provider hỗ trợ. Retry cần provider/message ID để không gửi trùng.

## Friend, group và labels/tags

Friend chủ yếu được sync từ Zalo event/cron, nhưng có accept/reject/block/alias routes. Groups có sync/list/chat integration. Zalo Real labels đồng bộ per nick; Tag Taxonomy v2 có Tag/FriendTag/ContactTag và mount prefixes riêng. Legacy CRM tags vẫn cùng tồn tại.

Update tag nguồn `zalo_real` có thể push qua Zalo SDK và chỉ chấp nhận palette đã code; priority/group là CRM-local. Sync/push failure không được làm local/provider state lặng lẽ lệch; cần reconciliation/log.

## Appointments

Authenticated CRUD/reminder flow gắn Contact; public action link `/a/:code` hoặc API action dùng token. Token public phải hết hạn/one-time/scope theo implementation. Reminder job chạy in-process; production delivery provider và duplicate schedule cần verify.

## Media

Upload validate multipart/kind/size/content, scan ClamAV khi bật, ghi blob/asset metadata và storage. Media public namespace phục vụ Zalo CDN; recording private encrypted. Album/favorite/trash/GC/forward routes có nhiều side effects; permission và reference count phải kiểm trước hard delete.

Production ClamAV bật fail-closed theo runtime snapshot. Local dev behavior tùy env; không bỏ scan failure chỉ để upload pass.

## OmiCall

Browser softphone dùng connect-config/SIP credential, gọi trực tiếp WSS/WebRTC. API tạo/patch CDR; provider webhook và history sync upsert cùng `TelephonyCall`. Normalize/reconciliation theo provider call ID/owner cần idempotent. Recording mirror tải rồi AES-256-GCM và phục vụ qua authenticated decrypt route.

Terminal CDR relay sang `crm-custom` là best-effort; CRM dùng `call_uuid` chống trùng. Failure relay không chặn call nguồn. Production OmiCall/ZCC flags tắt, telephony grant thiếu và audio hai chiều chưa verified: **PARTIAL / NOT PRODUCTION-READY**.

## Privacy main nick

User thực hiện OTP Zalo qua privacy routes, tạo `UserPrivacySession`; redaction middleware bảo vệ chat/content tùy session. Session/OTP/rate limit/logging phải kiểm riêng. UI unlock không được bypass backend redaction.

## Telegram bridge

Khi có config/token, Zalo event đi bridge bus tới Telegram topic; reply Telegram quay về Zalo. DB giữ bridge/config/topic mapping. Missing config degrade/disable. Bot API/MTProto retry/rate-limit/replay/permission production chưa được verify đầy đủ.

## Reports, analytics và marketing

Reports/engagement/scoring/list/group-scan có route/module và một số test. Một số analytics còn placeholder zero/TODO; không công bố metric production chính xác nếu query chưa implemented. Lead Pool/Facebook Ads EE models/artifacts tồn tại nhưng Community `_ee` absent, nên runtime main không mount đầy đủ.

## Verification theo flow

Mỗi flow cần success + validation + anonymous/forbidden/wrong-org/owner/Zalo scope + concurrency/retry/provider failure. Chat/telephony cần realtime/out-of-order; media cần malware/authorization; public actions cần token abuse; jobs cần duplicate runner/restart. Cập nhật route, data, security và integration docs cùng behavior.
