# Testing reality

## Có trong repo

- Backend Vitest: 98 file test/spec được phát hiện; config Community chọn 62 file trong baseline hiện tại.
- Frontend Vitest/jsdom: 5 file.
- TypeScript typecheck hai phía.
- Vite production build.
- Một số security/DB integration suite cần PostgreSQL thật và env riêng.
- Không có stable browser E2E suite hay CI workflow trong repo.

## Baseline 2026-08-24

- Backend: 62 file, 470 test pass.
- Frontend: 5 file, 42 test pass.
- `npx tsc --noEmit`: pass.
- `npx vue-tsc --noEmit`: pass.
- `npx vite build`: pass, cảnh báo chunk >500 kB.
- `npm run build` backend local: `ENVIRONMENT` failure do `EPERM` khi ghi artifact đã có trong `backend/dist`; không có type error. Production cùng commit healthy và image đã được build trước đó.

Build pass không chứng minh business correctness. Release cần API/DB/browser/runtime layers theo phạm vi; auth/RBAC cần negative tests và cross-tenant tests.

## Browser local

Trong workspace Full Docker, browser acceptance phải chạy trên
`http://localhost:${APP_PORT:-3080}` sau khi image được rebuild. Kết quả từ Vite
`:5173`/`:5183`, mock API hoặc file trong `frontend/dist` chỉ là kiểm tra cô lập;
không chứng minh bundle mà container đang phục vụ đã đổi. Có thể đối chiếu asset
trong HTML/runtime với asset build mới khi nghi ngờ container cũ.
