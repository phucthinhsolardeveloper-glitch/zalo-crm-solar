# ZCRM Solar v3.4

ZCRM Solar là bản triển khai ZaloCRM Community cho Phúc Thịnh Solar: CRM đa người dùng quản lý nhiều tài khoản Zalo cá nhân, hội thoại realtime, Friend/Contact, lịch hẹn, media, nhóm, tags, scoring/engagement, báo cáo, phân quyền, automation và cuộc gọi OmiCall.

Repo này sở hữu kênh Zalo, Contact aggregation và telephony orchestration phía ZCRM. Repo [CRM Custom](../crm-custom/README.md) sở hữu Lead/Customer/Order/Payment nghiệp vụ; hai hệ thống không dùng chung database và chỉ liên kết qua contract idempotent.

## Trạng thái đã xác minh

Snapshot runtime ngày 2026-09-29: branch `master01` được triển khai tại
`/srv/zcrm` trên VPS `pts-prod-01` (`222.255.182.182`).

- Domain `https://zcrm.phucthinhsolar.com` đi qua Caddy dùng chung và có TLS tự động.
- App/PostgreSQL/Redis/ClamAV/backup đều healthy; `/health` báo database connected.
- 119 migration đã apply; database mới đang ở trạng thái `needsSetup=true` và chưa có dữ liệu nghiệp vụ.
- Production dùng `STORAGE_DRIVER=local`; MinIO được tách khỏi profile mặc định trên VPS.
- OmiCall/ZCC tắt cho tới khi có credential production và đóng các gate telephony.

Kết luận theo quality gate: **NOT READY FOR PRODUCTION** dù runtime hiện đang chạy.

Blocker:

- Chưa có telephony grant trong RBAC; OmiCall production đang disabled.
- Audio/recording đủ hai phía chưa verified; audit cũ ghi nhận recording mono.
- HTTPS/domain đã hoàn tất; CSP vẫn ở `report-only`.
- Tenant guard off và RLS false; backend scope phụ thuộc route/service.
- Restore rehearsal chưa được thực hiện/ghi evidence.
- Thiếu browser E2E ổn định theo role/org/Zalo scope.
- Status, tags và role/grant còn hệ thống legacy + mới song song; analytics có placeholder.
- **CAPACITY NOT YET BENCHMARKED**.

Xem [project status](docs/00-project/status.md), [current state](docs/10-audits/current-state.md) và [production readiness](docs/10-audits/production-readiness.md).

## Tính năng và mức hoàn thiện

### Authentication, organization và RBAC

- Initial setup owner, login, forced password change, access JWT và opaque refresh rotation.
- Organization/user/profile, department tree, permission groups, user assignments và grants.
- Access token 15 phút; refresh family 30 ngày, family max 90 ngày, reuse grace 20 giây.
- Frontend router guard + backend auth/grant/Zalo/contact/privacy enforcement.

RBAC mới và legacy role cùng tồn tại. Frontend `meta.resource` chỉ là UX; Fastify preHandler/service scope là security boundary. Telephony chưa có grant resource hoàn chỉnh.

### Zalo accounts và realtime chat

- Nhiều Zalo account cá nhân, QR/session storage, reconnect/health/sync và owner access.
- Conversation/message inbound/outbound, Socket.IO org rooms, virtual chat và aggregate Contact/Friend.
- Send text/media, reply/forward/undo/delete theo provider capability; rate limiting và event buffer.
- Manual disconnect được phân biệt để không auto-reconnect ngoài ý muốn.

Zalo provider SLA/rate limit chính thức chưa được ghi thành fact nếu code/runtime không chứng minh.

### Friend, Contact và customer context

- Friend per Zalo nick; Contact là hồ sơ CRM tổng hợp nhiều identity/channel.
- Contact CRUD/quick-create, visibility/edit scope, duplicate review/merge, phones/notes/timeline/activity.
- Friends accept/reject/block/alias và sync từ Zalo event/cron.
- Dynamic statuses và legacy status field vẫn song song; cần cutover plan.

### Groups, tags, scoring và engagement

- Group list/sync/chat, group scan và customer lists Community.
- Zalo Real labels per nick, legacy CRM tags và Tag Taxonomy v2 (`Tag`, `FriendTag`, `ContactTag`).
- Scoring, engagement heatmap, stuck leads, interaction/presence and scheduled recompute.

Tags/status có duplicate ownership đang được quản lý; feature mới phải chọn canonical subsystem, không ghi cả hai tùy tiện.

### Appointments và notifications

- Appointment CRUD, reminder job và public action link dùng token.
- Notifications/push targets và UI bell/updates.
- Public token/action route cần test expiry/replay/scope; không coi prefix public là không có security contract.

### Media và object storage

- Upload/download, media assets/blobs, albums, favorites, forwarding, trash và GC.
- Storage driver local hoặc S3-compatible/R2; Compose có MinIO.
- ClamAV scan theo environment; production quan sát bật fail-closed.
- Media public namespace phục vụ Zalo CDN; recordings private và encrypted.

File metadata trong PostgreSQL và object/file bytes phải được backup/restore đồng bộ.

### OmiCall telephony

- Browser softphone dùng OmiCall WebSDK/SIP WSS; RTP/WebRTC đi browser↔provider.
- Per-user extension/SIP credential mã hóa, connect-config, local CDR create/patch/list.
- Public provider webhook, history sync và reconciliation theo provider call ID/owner.
- Recording mirror download → AES-256-GCM → private storage → authenticated playback.
- Best-effort terminal CDR relay tới CRM Custom bằng `call_uuid` idempotency key.

Trạng thái: implementation lớn nhưng **PARTIAL**; grant, provisioning lifecycle, production enable và two-party audio chưa đạt gate. Xem [telephony](docs/07-features/telephony.md).

### Telegram, AI và integrations

- Telegram bridge Bot API/MTProto, Zalo thread↔Telegram topic mappings.
- AI providers Anthropic/Gemini/OpenAI-compatible, suggestion/summary/sentiment/RAG/config/usage.
- Outbound webhooks, API/public token, Firebase push và integration settings.
- Ads/Lead Pool models/artifacts tồn tại nhưng Community `_ee` absent nên main runtime không mount đầy đủ Facebook Lead Ads/EE workflows.

Chi tiết: [integrations](docs/08-integrations/README.md) và [CRM Custom boundary](docs/08-integrations/crm-custom-boundary.md).

### Reports và analytics

- Report overview, Zalo fleet, sales/pipeline/engagement/audit/CRM usage; saved reports và basic exports.
- Một số query/metric còn placeholder zero/TODO; không coi mọi widget là production-complete.

Luồng end-to-end: [business flows](docs/07-features/business-flows.md).

## Kiến trúc

```text
Browser
  → Vue 3 SPA + Pinia/Vue Router/Vuetify
  → Axios /api/v1 + Socket.IO
  → Fastify 5 / Node.js 22 container :3000
     - REST + SPA + Socket.IO
     - Zalo listeners/connections
     - cron + BullMQ workers trong cùng process
  → Prisma 7 / PostgreSQL 16
  → Redis 7 AOF
  → local/MinIO/S3/R2 storage + ClamAV
  → Zalo/OmiCall/Telegram/AI/Webhook providers
```

Production host port mặc định map `3080 → 3000`. Một app process phục vụ HTTP/realtime/jobs; scale ngang cần distributed ownership/locks cho scheduler/Zalo session/listener và capacity benchmark.

Chi tiết: [architecture overview](docs/01-architecture/overview.md), [components](docs/01-architecture/components.md), [frontend](docs/01-architecture/frontend.md), [backend](docs/01-architecture/backend.md), [request flow](docs/01-architecture/request-flow.md), [data flow](docs/01-architecture/data-flow.md).

## Tech stack

- Frontend: Vue 3, Vite 8, TypeScript, Pinia, Vue Router, Vuetify, Axios, Socket.IO client.
- Backend: Fastify 5, TypeScript ESM, Prisma 7/adapter-pg, Socket.IO, BullMQ/node-cron, `zca-js`.
- Data: PostgreSQL 16; schema snapshot 113 model/2 enum/119 migration.
- Infra: Redis 7 AOF/noeviction, MinIO/S3-compatible storage, ClamAV, Docker Compose backup service.
- Runtime image: Node.js 22.

## Cấu trúc repository

```text
zalo-crm-solar/
├── backend/
│   ├── src/app.ts             # composition root
│   ├── src/modules/           # auth, Zalo, chat, contacts, RBAC, media, telephony...
│   ├── src/shared/            # Prisma, realtime, storage, security, utilities
│   └── prisma/                # schema, 119 migrations, seed
├── frontend/
│   ├── src/router/            # route + guard
│   ├── src/api/               # Axios/Socket.IO
│   ├── src/stores/            # auth/privacy/RBAC
│   ├── src/composables/       # feature state/transport
│   └── src/views/components/  # UI
├── docs/                      # canonical current knowledge
├── _archive/legacy-docs/      # preserved historical docs/assets
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

API inventory: [375 literal Fastify routes/55 areas](docs/04-api/route-catalog.md); audit source count khoảng 404 declarations do route động/pattern ngoài catalog. Schema inventory nằm ở [data model](docs/03-data/data-model.md).

## Yêu cầu hệ thống

- Windows: WSL2 (Ubuntu/Debian) là môi trường phát triển được khuyến nghị; đặt source
  trong filesystem Linux (`~/src/...`), không build trực tiếp dưới `/mnt/c` hoặc `/mnt/d`.
- Docker Engine trong WSL hoặc Docker Desktop với WSL Integration bật cho distro đang dùng,
  kèm Docker Compose v2.
- Node.js 22 + npm nếu chạy hybrid/local ngoài container (`.nvmrc` là nguồn chuẩn).
- Port mặc định 3080 và các infra ports theo Compose còn trống.
- Browser hỗ trợ WebRTC nếu dùng softphone.
- Secret/local environment mới; không copy/paste production `.env`.

## Cài đặt mới

### Docker Compose

```bash
cp .env.example .env
# Điền secret local an toàn; không commit .env
docker compose up -d --build
docker compose ps
docker exec zalo-crm-app npx prisma migrate deploy
```

Truy cập mặc định `http://localhost:3080`, rồi dùng setup flow tạo organization/owner nếu database trống. Không chạy migration reset hoặc `db push --accept-data-loss`.

### WSL-first hybrid development

Mở Ubuntu/WSL2 rồi chạy từ repo hiện tại (script sẽ sao chép sang filesystem Linux nếu
repo đang ở `/mnt/d`):

```bash
./bin/wsl-setup
cd ~/src/zalo-crm-solar
```

Sau đó khởi động infrastructure bằng Docker và chạy app native trong WSL:

```bash
docker compose up -d db redis minio minio-init
./bin/dev-setup
```

Khởi động PostgreSQL/Redis/storage theo [local setup](docs/02-development/local-setup.md), rồi:

```bash
cd backend
npm install
npm run dev

cd ../frontend
npm install
npm run dev
```

Vite proxy `/api` và `/socket.io` tới `VITE_BACKEND_URL || http://localhost:3000`. Xác nhận database/storage là môi trường dev trước seed/migration.

## Commands

```bash
# Backend
cd backend
npm run dev
npm test
npx tsc --noEmit
npm run build
npx prisma generate
npx prisma migrate dev       # development only
npx prisma migrate deploy    # production/release
npx prisma studio            # local/dev only

# Frontend
cd frontend
npm run dev
npm test
npx vue-tsc --noEmit
npm run build

# Docker/runtime
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 app
```

Không dùng `docker compose down -v`, `prisma migrate reset`, production `db push`, seed wipe hoặc xoá volume. Command/side effects chi tiết: [commands](docs/02-development/commands.md).

## Environment contract

Các nhóm chính, không ghi giá trị thật:

- App/database/auth: app URL/port, PostgreSQL URL/password, JWT, refresh/token-encryption keys.
- Redis và object storage: Redis URL; local/S3/R2 endpoint/bucket/access/secret/public URL.
- Media security: ClamAV enabled/fail-closed, file size/type và recording encryption.
- Zalo: session/runtime configuration theo code; session data nằm DB, không đưa vào docs.
- OmiCall/ZCC: feature flags, API/webhook/SIP/provisioning/relay configuration.
- Telegram/AI/Ads/Firebase/webhooks: optional theo feature.
- Tenant/security flags: tenant guard, RLS, CSP/report-only và deployment flags.

Production snapshot: environment `production`, storage local, antivirus enabled/fail-closed, automation/friend-invite test off, tenant guard off, CSP report-only, RLS false, OmiCall/ZCC false.

Xem [environment](docs/02-development/environment.md) và [secrets](docs/05-security/secrets.md).

## API, authentication và realtime

- Main REST prefix `/api/v1`; một số public endpoints dưới `/api/public`, appointment action và provider webhook.
- Protected route dùng `Authorization: Bearer <access JWT>`.
- Global rate limit 1.200 API request/phút/user, fallback IP.
- Error cơ bản `{error: string}` nhưng chưa có envelope thống nhất toàn repo.
- `/health` kiểm database; `/api/v1/status` trả API banner.
- Socket.IO verify JWT và join org room; UI route guard không thay backend check.

Không dùng legacy base URL/token TTL làm contract. Route source + test là truth. Xem [API overview](docs/04-api/overview.md), [auth](docs/04-api/authentication.md), [route catalog](docs/04-api/route-catalog.md).

## Testing và quality gate

Baseline 2026-08-24:

- Backend: 62 files, 470 tests pass; TypeScript no-emit pass.
- Frontend: 5 files, 42 tests pass; vue-tsc pass; Vite production build pass.
- Backend emit build local: `ENVIRONMENT` failure `EPERM` ghi existing `backend/dist`.
- Production same commit: app/container/DB healthy, nhưng runtime health không thay business/E2E evidence.
- Frontend build cảnh báo bundle lớn (`exceljs` khoảng 930 KB; main CSS khoảng 812 KB).

Release vẫn cần role/org/Zalo-scope E2E, telephony/audio/recording, migrations, backup/restore, security và monitoring checks. Xem [testing](docs/02-development/testing.md).

## Nâng cấp và deployment

Quy trình an toàn thay thế các hướng dẫn legacy dùng `db push --accept-data-loss`:

1. Review release SHA/diff, env additions, migration SQL và rollback compatibility.
2. Backup PostgreSQL + media/object storage; xác nhận restore confidence.
3. Pull/build artifact hoặc image từ revision đã review.
4. Chạy `prisma migrate deploy`; không `migrate dev/db push` production.
5. Recreate/restart chỉ service app cần thiết; không xoá volume.
6. Kiểm `/health`, migration status, containers/logs và core flows.
7. Theo dõi Zalo reconnect, Socket.IO, queues/jobs, storage/ClamAV và integrations.

Giữ nguyên encryption/JWT/database/storage secrets khi update trừ khi đang thực hiện rotation/re-encryption có kế hoạch. `restart` có thể không nạp env mới tùy Compose; dùng runbook exact thay vì đoán.

Xem [deployment](docs/06-operations/deployment.md), [production](docs/06-operations/production.md), [rollback](docs/06-operations/rollback.md).

## Backup và restore

Persistent set gồm PostgreSQL, media/object storage, upload/recording references và secret/key material cần cho decrypt. Redis AOF relevance phụ thuộc queue/RPO.

Production backup service đã tạo dump khác rỗng và log success ngày audit, nhưng restore rehearsal chưa có evidence. Do đó classification là `PARTIAL`, không phải DR verified.

Restore phải vào môi trường cô lập, kiểm migration/schema/row counts/login/Contact/chat/media/recording và consistency DB↔object storage; đo RPO/RTO. Xem [backup/restore](docs/03-data/backup-restore.md).

## Security posture

Controls đã thấy: access/refresh rotation, grants/Zalo/contact scope, rate limit, trusted proxy, media validation, ClamAV fail-closed production, encrypted recording và audit/activity surfaces.

Rủi ro còn mở: HTTP/TLS/CSP, tenant guard/RLS off, dual RBAC/status/tag systems, telephony grant, E2E role coverage, restore rehearsal, provider/data-retention verification. Không đưa secret/session/SIP/customer content vào docs/log.

Xem [security model](docs/05-security/security-model.md), [auth/RBAC](docs/05-security/auth-rbac.md), [security checklist](docs/05-security/security-checklist.md).

## Troubleshooting nhanh

- App unhealthy: kiểm `docker compose ps`, `/health`, app/DB/Redis logs và migration status.
- Zalo không reconnect: kiểm account archived/manual disconnect/session/UID/provider status; không paste session data.
- Chat thiếu message: kiểm listener/DB/event buffer/Socket.IO room rồi REST resync; tránh resend mù.
- Upload lỗi: kiểm storage path/bucket/public URL, ClamAV/fail-closed, size/type và permissions.
- OmiCall 503/chưa gọi được: kiểm feature flag, user extension/SIP, provider grant/connect-config; không log password.
- Recording không nghe: kiểm CDR/recording URL/mirror/encryption key/private playback; chưa giả định stereo/two-party.
- Migration/deploy lỗi: dừng rollout, giữ backup/log, không reset DB/volume.

Xem [debugging workflow](docs/11-workflows/debugging-workflow.md) và [incident response](docs/06-operations/incident-response.md).

## Documentation

- [Documentation portal](docs/README.md)
- [Project overview/status/glossary](docs/00-project/)
- [Architecture/frontend/backend/flows](docs/01-architecture/)
- [Development/setup/environment/testing](docs/02-development/)
- [Data/schema/migrations/backup](docs/03-data/)
- [API/auth/route catalog](docs/04-api/)
- [Security/RBAC](docs/05-security/)
- [Operations](docs/06-operations/)
- [Features/business flows](docs/07-features/)
- [Integrations](docs/08-integrations/)
- [Audits/readiness](docs/10-audits/)
- [AI context map](docs/12-ai/context-map.md)
- [Legacy inventory](_archive/legacy-docs/2026-08-24/LEGACY-INVENTORY.md)

Legacy của ZCRM và tài liệu rời `D:/IT` được bảo tồn theo provenance riêng trong archive. Legacy `crm-custom` nằm trong chính repo `crm-custom`, không giữ bản trùng ở đây.

## License, attribution và pháp lý

Project giữ các file canonical `LICENSE`, `NOTICE`, `DCO` và `THIRD-PARTY-LICENSES.md`. Đây là phần phải đọc trước khi phân phối/host network service hoặc dùng thương hiệu. README legacy có lịch sử release, cộng đồng, disclaimer và dual-license/trademark context; nội dung đó vẫn được bảo tồn trong archive, còn license file hiện tại là nguồn pháp lý ưu tiên.
