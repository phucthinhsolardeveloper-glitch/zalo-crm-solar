# 03 — Frontend

**Entry:** `frontend/src/main.ts` — `createApp` + Pinia + Vue Router + Vuetify.  
**Build:** `vue-tsc -b && vite build` → artefact copy vào `/app/static` trong Docker.

---

## Bootstrap `VERIFIED`

```text
main.ts
  → App.vue
  → router (history mode)
  → DefaultLayout | AuthLayout (theo meta.layout)
```

`DefaultLayout.vue` import `TelephonySoftphone` — softphone **global** khi đã login.

PWA service worker: **tắt** (TODO trong `main.ts`).

---

## Routing `VERIFIED`

File: `frontend/src/router/index.ts`.

| Path | View | Auth | Ghi chú |
|---|---|---|---|
| `/login` | LoginView | public | |
| `/setup` | SetupView | public | first org |
| `/setup-password` | ForcePasswordChangeView | auth + allowUnchangedPassword | |
| `/appointments/action` | AppointmentActionView | **public** (`meta.public`) | token `?t=` |
| `/` | DashboardView | auth | |
| `/chat/:convId?` | ChatView | resource `conversation` | |
| `/contacts` | ContactsView | `contact` | |
| `/contacts/:id/profile` | ContactProfileView | `contact` | |
| `/friends` | FriendsView | `friend` | |
| `/groups` | GroupsView | auth | |
| `/media` | MediaView | `media` | |
| `/appointments` | AppointmentsView | auth | |
| `/call-history` | CallHistoryView | auth | OmiCall |
| `/reports/*` | ReportsShell + children | `engagement_score` | |
| `/analytics` | AnalyticsView | `engagement_score` | |
| `/settings/**` | SettingsLayout nested | mixed resources | |
| `/marketing/**` | Community shell | chỉ khi `!isExtension` | group-scan, lists |
| `/leads/stuck` | StuckLeadsView | `contact` | |
| `/customers/:id/activity` | CustomerActivityLogView | `contact` | |
| `/:pathMatch(.*)*` | NotFoundView | | |

Guard: thiếu token → `/login`; `passwordChangedAt === null` → `/setup-password`; `meta.resource` → `authStore.canAccess`.

---

## State `VERIFIED`

| Store | File | Vai trò |
|---|---|---|
| auth | `stores/auth.ts` | user, token, grants, setup/login/logout, `canAccess` |
| privacy | `stores/privacy.ts` | unlock nick |
| rbac | `stores/rbac.ts` | users list types (gồm `omicallExtension`) |

Phần lớn UI state nằm **composable** (không phải Pinia): `use-chat.ts`, `use-contacts.ts`, `use-omicall-softphone.ts`, …

---

## API client `VERIFIED`

`frontend/src/api/index.ts`:

- `axios.create({ baseURL: '/api/v1' })`
- Request: `localStorage.token` → `Authorization: Bearer`
- POST/PUT/PATCH không body → `{}` JSON (tránh Fastify 415)
- 401 → `ensureFreshToken()` → `POST /api/v1/auth/refresh` (axios trần) → retry
- Single-flight + lock `localStorage['auth:refresh-in-progress']` (cross-tab)
- 403 toast; 5xx toast trừ `skipErrorToast` (dùng cho OmiCall 503 “chưa gán extension”)

Vite proxy (`vite.config.ts`): `/api` và `/socket.io` → `VITE_BACKEND_URL || http://localhost:3000`.

Trong Docker production: **không** có Vite; SPA và API **cùng origin** port host `APP_PORT` (3080→3000).

---

## Realtime `VERIFIED` (file tồn tại)

- `frontend/src/api/socket.ts` — `createAppSocket`, dùng chung refresh token (`ensureFreshToken` comment trong api/index).
- `use-chat.ts` import `createAppSocket`.
- Composables khác: `use-friend-socket.ts`, `use-muc-tieu-socket.ts`.

Chi tiết event name: xem backend `shared/realtime` + `zalo-socket.ts` / `chat-operations-routes.ts` (`INFERRED` đầy đủ catalog — không dump hết event trong phase này).

---

## Chuỗi UI → API (ví dụ đã truy vết)

### Contact CRUD

```text
ContactsView / composable
  → use-contacts.ts
      GET    /contacts
      GET    /contacts/:id
      POST   /contacts
      PUT    /contacts/:id
      DELETE /contacts/:id
      GET    /contacts/duplicates
      POST   /contacts/duplicates/:id/merge|dismiss
  → axios /api/v1/...
  → contact-routes.ts
```

### Chat send

```text
ChatView → use-chat.ts
  → GET  /conversations
  → GET  /conversations/:id/messages
  → POST /conversations/:id/messages
  → Socket.IO patches
  → chat-routes.ts + zaloPool / virtual chat
```

### Softphone

```text
TelephonySoftphone.vue + MessageThread call button
  → use-omicall-softphone.ts
      GET  /telephony/omicall/connect-config   (SIP user/password decrypted)
      POST /telephony/calls
      PATCH /telephony/calls/:id
      GET  /telephony/calls
      POST /telephony/omicall/sync
      POST /telephony/omicall/resolve-conversation-target
  → OmiCall JS SIP (browser WSS) — không đi qua Fastify cho RTP
```

### Gán extension

```text
UserEditPanel.vue
  → PUT  /users/:id/omicall-extension
  → POST /users/:id/omicall-auto-provision   (working tree)
```

---

## Forms / validation `INFERRED`

Validation chủ yếu **server 400** + UI field required (Vuetify). Không thấy thư viện Yup/Zod trên frontend `package.json`.

---

## Types `VERIFIED`

Một phần interface nằm trong composable (`use-contacts` Contact type, `use-chat`). `frontend/src/types/stringee-web.d.ts` — di sản Stringee (telephony hiện OmiCall).

---

## UNKNOWN

- Catalog đầy đủ Socket.IO event names phía FE.
- Coverage test frontend thực tế (file test tồn tại nhưng chưa liệt kê hết).
