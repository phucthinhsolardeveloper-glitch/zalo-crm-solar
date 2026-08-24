# API overview

Backend Fastify register khoảng 404 route declaration trong source. Base path nội bộ chủ yếu `/api/v1`; production cùng container phục vụ SPA và API.

## Conventions đã xác minh

- Auth: `Authorization: Bearer <access JWT>` cho route protected.
- Access token mặc định 15 phút; refresh opaque rotation qua `/api/v1/auth/refresh`.
- Global rate limit: 1200 API request/phút/user, fallback IP.
- Error handler trả `{ error: string }` và status code; một số route thêm `code`/metadata. Không có một schema error thống nhất được enforce toàn repo.
- `/health` kiểm DB; `/api/v1/status` trả banner version API.
- API public tồn tại cho setup/login, org branding, appointment action, webhook/provider; phải review từng route, không suy ra từ prefix.

Legacy API docs/Postman đã archive vì chứa claim token 7 ngày và base URL production giả định. Chưa có OpenAPI/generated contract canonical; route source + test là truth.

## Route ownership

Tìm route trong `backend/src/modules/*/*-routes.ts`, rồi kiểm registration tại `backend/src/app.ts`. Frontend caller ở `frontend/src/api`, composables và stores.
