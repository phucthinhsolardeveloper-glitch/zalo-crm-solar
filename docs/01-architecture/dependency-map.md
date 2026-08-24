# Dependency map

## Build/runtime trực tiếp

- Node 22 Alpine trong Docker; package local đã test trên Node 24 nhưng parity mục tiêu là Node 22.
- Frontend build trước, backend TypeScript + Prisma generate sau; artifact được copy vào image runtime.
- Backend phụ thuộc PostgreSQL; compose chờ DB/Redis/MinIO healthy trước app.
- Redis là dependency cứng của queue/cache trong compose.
- Local storage vẫn là runtime production snapshot dù MinIO service đang chạy; storage driver chọn bằng env.

## External

- Zalo: `zca-js`; session account và provider behavior không có SLA/rate limit chính thức trong repo.
- OmiCall: SIP/WebRTC, webhook, directory/history/recording API.
- Telegram: Bot API + MTProto provisioner.
- AI: Anthropic, Gemini và OpenAI-compatible endpoints theo config.
- Optional: S3/R2, Firebase, Google Sheets, Zapier-style webhook; Facebook/TikTok/Zalo Ads schema tồn tại nhưng phần runtime chính phụ thuộc extension bundle.

Không pin digest cho image `minio:latest`; đây là supply/reproducibility risk. Không có dependency update bot hay CI trong repo.
