# Request flow

## Authenticated REST

```text
Vue view/composable
  → Axios `/api/v1/*` + Bearer access JWT
  → global Fastify plugins (CORS, JWT, headers, rate-limit)
  → route preHandler (`authMiddleware`, grant/role/scope khi route khai báo)
  → service/Prisma query trong tenant context
  → PostgreSQL
  → JSON → Pinia/composable/view
```

Rate limit toàn API là 1200 request/phút theo user JWT, fallback theo IP. Static assets được allow-list.

## Realtime Zalo

```text
Zalo event → zca-js listener → handler/service → PostgreSQL/event buffer
  → Socket.IO room đã xác thực theo org → frontend cập nhật chat/presence
```

Socket.IO có middleware verify JWT và auto-join org room trước handler. Việc bảo vệ UI route không thay thế backend check.

## OmiCall

```text
Frontend softphone → connect-config có auth → SIP/WebRTC provider
Provider webhook/history API → public route có secret/status mapping
  → TelephonyCall/recording storage → authenticated history/playback UI
```

OmiCall có ba nguồn cập nhật CDR: SDK/client callback, webhook và history sync; reconciliation phải idempotent theo provider call ID/owner.
