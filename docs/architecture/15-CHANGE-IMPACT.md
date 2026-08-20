# 15 — Change Impact Map

Câu hỏi: **nếu sửa X thì kiểm tra những gì?** Chỉ map dựa trên layer thật.

---

## Thêm field Contact

```text
schema.prisma model Contact
  → migration
  → prisma generate (image rebuild Docker)
  → contact-routes create/update select/body
  → prisma extension nếu liên quan phone/fullName/crmName
  → use-contacts.ts type + form ContactsView / ChatContactPanel / ContactProfileView
  → filter list GET /contacts query
  → public API /api/public/contacts select
  → tests contact-*
  → export Excel reports nếu cột report
```

---

## Thêm field User (vd telephony)

```text
User model
  → migration
  → user-routes GET list **không** leak secret (omicallExtensionSecret)
  → PUT omicall-extension encrypt
  → connect-config decrypt
  → UserEditPanel + rbac store type
  → CreateUserWithZaloModal nếu provision lúc tạo
```

---

## Thêm/sửa API REST

```text
*-routes.ts
  → auth/grant
  → frontend api/ composable
  → RBAC resource nếu page mới (router meta + permission-types)
  → public-api nếu cần X-Api-Key
  → tests
```

---

## Đổi JWT / refresh

```text
auth-service + refresh-token-service + config TTL
  → frontend api interceptor + socket ensureFreshToken
  → bump jwtTokenVersion deploy script
  → mọi session user
```

---

## Đổi Prisma schema bất kỳ

```text
migrate
  → Docker: rebuild app (client generate) + migrate deploy
  → hybrid: generate + restart tsx
  → KHÔNG down -v
```

---

## Đổi Dockerfile / package.json

```text
rebuild image
  → lockfile backend: Dockerfile dùng npm install (drift)
  → frontend: npm ci --legacy-peer-deps
  → sharp/vips/ffmpeg alpine
```

---

## Đổi `.env` OmiCall

```text
OMICALL_ENABLED/DOMAIN/WSS → connect-config 503 nếu thiếu
WEBHOOK_SECRET → URL dashboard OmiCall phải khớp
API_KEY → sync history
CRM_CUSTOM_* → relay
restart/recreate app — không rebuild
```

---

## Đổi Zalo listener / message shape

```text
zalo-listener / message helpers
  → Message + Friend aggregate + Conversation unread
  → Socket emit FE use-chat
  → Telegram bridge
  → rate limiter
```

---

## Bật EE (`_ee`)

```text
copy bundle vào backend/src/_ee + frontend/src/_ee
  → routes Lead Pool, Facebook, Automation
  → Redis/BullMQ load cao hơn
  → FRIEND_INVITE_TEST_MODE
```

---

## Sửa Docker volume / compose ports

```text
conflict APP_PORT
  → APP_URL + CSP
MinIO 9000 public
  → Zalo CDN fetch
down -v
  → mất DB
```

---

## Tests tối thiểu khi đụng OmiCall

`backend/tests/omicall-*.test.ts` (status, token, webhook, recording, history-sync, zcc-target).
