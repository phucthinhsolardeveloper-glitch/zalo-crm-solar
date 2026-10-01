# Frontend architecture and implementation guide

## Bootstrap và build

`frontend/src/main.ts` tạo Vue 3 app, Pinia, Vue Router và Vuetify; `App.vue` chọn layout theo route meta. Vite 8/TypeScript build SPA, Docker copy artifact sang `/app/static` để Fastify phục vụ cùng origin. Production không dùng Vite dev proxy.

`DefaultLayout.vue` mount softphone global sau login. PWA service worker chưa được bật theo code/comment đã kiểm; không mô tả offline/PWA là feature hiện hành.

App shell desktop và banner login dùng bảng màu nhận diện canonical của website Phúc Thịnh Solar: nền navy sâu `#061537`/`#0a2251`, gold `#c9962e` và chữ trắng xanh nhạt. Wordmark chính thức nằm tại `frontend/public/brand/phuc-thinh-solar-wordmark.png`; `LoginBrandBanner.vue` là owner dùng chung cho `/login` và preview trong Hồ sơ tổ chức; `DefaultLayout.vue` là owner của wordmark, tab active, search và icon trên navbar. Các token này không dùng để ghi đè `primary` hoặc màu semantic/trạng thái của module CRM.

## Router và access UX

`frontend/src/router/index.ts` dùng history mode. Public/exception routes gồm login, initial setup, forced password setup và appointment action token. Authenticated routes bao phủ dashboard, chat, contacts/profile/activity, friends, groups, media, appointments, call history, reports/analytics, settings/RBAC, marketing Community screens và list/group-scan.

Route guard kiểm token, bắt user chưa đổi password vào setup-password và dùng `meta.resource` với `authStore.canAccess`. Đây là UI guard; backend Fastify preHandler/grant/Zalo/contact scope vẫn là security boundary.

Một số settings routes render `SettingsComingSoon.vue` (notifications/theme/sessions/billing/stuck/folders/templates/rate-limit/public-token/feature-flags/backup). Route tồn tại không đồng nghĩa feature backend đã implemented.

## State ownership

- `stores/auth.ts`: user, access/refresh lifecycle, grants, setup/login/logout và `canAccess`.
- `stores/privacy.ts`: session unlock/privacy state cho nick.
- `stores/rbac.ts`: types/data phục vụ user/RBAC, gồm OmiCall extension.
- Feature state lớn nằm trong composables như chat, contacts, friends, OmiCall, không phải tất cả ở Pinia.

Trước tạo store mới, xác định state cần global/persistent hay chỉ thuộc view/composable. Không giữ hai cache cạnh tranh cho cùng Contact/Conversation nếu socket và REST cùng cập nhật.

## API client và token refresh

`frontend/src/api/index.ts` tạo Axios base `/api/v1`, lấy access token từ localStorage và thêm Bearer. POST/PUT/PATCH không body được normalize thành `{}` để tránh Fastify 415. Khi 401, client dùng refresh endpoint bằng Axios độc lập rồi retry.

Refresh có single-flight trong tab và localStorage lock cross-tab. Access token mặc định 15 phút; refresh family 30 ngày, family max 90 ngày, reuse grace 20 giây theo backend canonical auth docs. Legacy API claim token 7 ngày là outdated.

403 hiển thị permission toast; một số call cho phép `skipErrorToast`, ví dụ OmiCall 503 khi chưa gán extension. Không chuyển mọi 403 thành logout và không loop refresh cho permission failure.

Vite dev proxy chuyển `/api` và `/socket.io` tới `VITE_BACKEND_URL || http://localhost:3000`. Production SPA/API/Socket.IO cùng origin tại host port 3080→container 3000.

## Realtime

`frontend/src/api/socket.ts` tạo authenticated Socket.IO connection; backend verify JWT và join org room. `use-chat.ts`, friend/mục-tiêu socket composables nhận event và patch UI. Event đến có thể song song với REST response, nên update phải idempotent/dedup bằng message/conversation/entity ID.

Catalog event đầy đủ chưa được sinh: `NEEDS VERIFICATION`. Khi đổi event, kiểm producer/room/payload/consumer/reconnect và snapshot-refresh fallback.

## Các flow UI đã truy vết

### Contact

Contacts view/composable gọi list/detail/create/update/delete, duplicate review/merge và subresources. Backend áp grant + contact visibility/editability scope; UI filter không thay scope. Mobile/desktop contact detail có implementation trùng cần tránh sửa lệch một bên.

### Chat

Chat view lấy conversations/messages, gửi message và nhận Socket.IO patch. Outbound Zalo đi Fastify → Zalo pool; inbound Zalo đi listener → DB → socket, không đi qua REST send route. Virtual chat có nhánh local/AI riêng.

### Softphone

Global `TelephonySoftphone`, message-thread call action và `use-omicall-softphone.ts` lấy connect-config, tạo/patch/sync CDR và resolve conversation target. SIP signaling/media đi trực tiếp browser↔OmiCall WSS/WebRTC; API không relay RTP.

### Settings/RBAC

Settings pages dùng `meta.resource`, nhưng save action phải theo grant backend. Status legacy/dynamic, tag legacy/v2 và role/grant coexist; UI mới phải chọn canonical API owner, không cập nhật cả hai tùy tiện.

## Forms, types và validation

Frontend chủ yếu dùng Vuetify required/rules và server error; không có global Zod/Yup contract được xác nhận. Backend route validation không đồng nhất, nên form phải xử lý 400/409/403 cụ thể và giữ input. Types phân tán ở composables/types; `stringee-web.d.ts` là di sản, telephony hiện OmiCall.

## Verification

Frontend baseline ngày 2026-08-24: 5 test file/42 test pass, `vue-tsc --noEmit` pass và Vite production build pass. Build cảnh báo bundle lớn (`exceljs` khoảng 930 KB, main CSS khoảng 812 KB), cần tối ưu nhưng không phải build failure.

Thay UI flow phải chạy target tests, vue-tsc, build và browser desktop/mobile. Với auth/chat/socket/softphone cần test refresh/reconnect/duplicate/out-of-order/permission, không chỉ render thành công.
