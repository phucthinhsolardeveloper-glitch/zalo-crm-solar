# 05 — API Map

Prefix nội bộ SPA: **`/api/v1`**.  
Public key API: **`/api/public`** (`X-Api-Key`).  
Health: **`GET /health`** (không JWT).

Auth mặc định: JWT Bearer. Ngoại lệ ghi ở cột Auth.

Frontend caller: composable/view điển hình — **không** phải mọi chỗ gọi.

---

## Auth & setup `VERIFIED`

| Method | Endpoint | Frontend | Handler | Service | DB | Purpose |
|---|---|---|---|---|---|---|
| GET | `/api/v1/setup/status` | auth store `checkSetup` | `auth-routes.ts` | `checkSetupStatus` | `users` count | First-run? |
| POST | `/api/v1/setup` | `setup()` | auth-routes | `setup()` | Organization, User | Tạo org+owner |
| POST | `/api/v1/auth/login` | auth store | auth-routes | `login` | User | Access+refresh |
| POST | `/api/v1/auth/refresh` | axios interceptor | auth-routes | `rotateRefreshToken` | RefreshToken | Xoay token |
| POST | `/api/v1/auth/logout` | auth store | auth-routes | `logoutByToken` | RefreshToken | Revoke family |
| GET | `/api/v1/profile` | auth `init` | auth-routes JWT | `getProfile` | User | Profile + grants |

---

## Users / me `VERIFIED`

| Method | Endpoint | Frontend | Handler | Purpose |
|---|---|---|---|---|
| GET/POST | `/api/v1/users` | `use-users` / RBAC | `user-routes.ts` | List/create |
| PUT | `/api/v1/users/:id` | UserEditPanel | user-routes | Update |
| PUT | `/api/v1/users/:id/password` | RBAC | user-routes | Admin set password |
| PUT | `/api/v1/users/:id/omicall-extension` | UserEditPanel | user-routes | Gán SIP |
| POST | `/api/v1/users/:id/omicall-auto-provision` | UserEditPanel (WT) | user-routes | Tạo/gán extension OmiCall |
| DELETE | `/api/v1/users/:id` | RBAC | user-routes | Xóa |
| POST | `/api/v1/users/:id/handoff` | — | user-routes | Bàn giao |
| GET | `/api/v1/audit-logs` | AuditLogView | user-routes + grant | Audit |
| PATCH | `/api/v1/me/profile` | PersonalAccount | user-routes | Self profile |
| POST | `/api/v1/me/change-password` | ForcePassword / settings | user-routes | Đổi MK |

---

## Contacts `VERIFIED`

| Method | Endpoint | Frontend | Handler | DB | Purpose |
|---|---|---|---|---|---|
| GET | `/api/v1/contacts` | `use-contacts` | contact-routes + grant access | Contact | List filter |
| GET | `/api/v1/contacts/:id` | use-contacts | contact-routes | Contact | Detail |
| POST | `/api/v1/contacts` | use-contacts | contact-routes | Contact | Create |
| PUT | `/api/v1/contacts/:id` | use-contacts | contact-routes | Contact | Update |
| DELETE | `/api/v1/contacts/:id` | use-contacts | contact-routes | Contact | Delete |
| GET | `/api/v1/contacts/pipeline` | dashboard/contacts | contact-routes | Contact+Status | Pipeline |
| POST | `/api/v1/contacts/:id/virtual-conversation` | chat | contact-routes | Conversation | Chat KH no-Zalo |
| POST | `/api/v1/contacts/duplicates/:groupId/merge` | use-contacts | merge-service | Contact | Gộp trùng |

---

## Chat `VERIFIED`

| Method | Endpoint | Frontend | Handler | Purpose |
|---|---|---|---|---|
| GET | `/api/v1/conversations` | use-chat | chat-routes + grant | Inbox list |
| GET | `/api/v1/conversations/:id` | use-chat | chat-routes | Thread |
| GET | `/api/v1/conversations/:id/messages` | use-chat | chat-routes | History |
| POST | `/api/v1/conversations/:id/messages` | use-chat | chat-routes + zaloAccess chat | Gửi tin |
| POST | `/api/v1/conversations/:id/mark-read` | use-chat | chat-routes | Đã đọc |
| DELETE | `/api/v1/conversations/:id` | use-chat | chat-routes | Soft delete |
| POST | `/api/v1/conversations/:id/restore` | use-chat | chat-routes | Khôi phục |

---

## Telephony `VERIFIED`

| Method | Endpoint | Auth | Frontend | Handler | DB | Purpose |
|---|---|---|---|---|---|---|
| POST | `/api/v1/telephony/omicall/events` | **query `key` webhook secret** (không JWT) | OmiCall cloud | `omicall-public-routes.ts` | TelephonyCall | CDR inbound |
| GET | `/api/v1/telephony/omicall/connect-config` | JWT | use-omicall-softphone | telephony-routes | User | SIP creds |
| GET | `/api/v1/telephony/omicall/available-extensions` | JWT owner/admin | UserEdit (INFERRED) | telephony-routes | OmiCall API + User | List unassigned |
| POST | `/api/v1/telephony/omicall/resolve-conversation-target` | JWT + zalo chat + privacy | MessageThread | telephony-routes | Conversation, Contact | Số gọi ZCC |
| GET | `/api/v1/telephony/calls` | JWT | CallHistoryView, softphone | telephony-routes | TelephonyCall | History |
| POST | `/api/v1/telephony/omicall/sync` | JWT | CallHistory, softphone | `syncOmicallHistoryForUser` | TelephonyCall | Backfill API v3 |
| POST | `/api/v1/telephony/calls` | JWT | softphone | telephony-routes | TelephonyCall | Tạo call local |
| PATCH | `/api/v1/telephony/calls/:id` | JWT | softphone | telephony-routes | TelephonyCall | Update status |

---

## Zalo accounts (nhóm) `VERIFIED`

Prefix `/api/v1/zalo-accounts` — list, archived, stats, enriched, sdk-limits, access, labels, sync-contacts, sync-history (`zalo-routes`, `zalo-dashboard-routes`, `zalo-access-routes`, `zalo-sync-routes`, `zalo-labels-routes`). Frontend: `use-zalo-accounts.ts`, `ZaloAccountsView.vue`.

Friends: `/api/v1/friends`, `/api/v1/friends-db` — `friend-routes.ts` + `use-friends.ts`.

---

## RBAC `VERIFIED`

`/api/v1/departments`, `/api/v1/permission-groups`, `/api/v1/rbac/users` — views `rbac/*`.

Privacy: `/api/v1/privacy/*` — store privacy.

---

## Khác (prefix đã grep) `VERIFIED`

| Prefix | Module |
|---|---|
| `/api/v1/ai/*` | ai-routes |
| `/api/v1/scoring/*`, `/api/v1/leads/stuck` | scoring-routes |
| `/api/v1/dashboard/*` | dashboard-routes + action-hub |
| `/api/v1/reports/*` | report-routes + analytics |
| `/api/v1/search` | search-routes |
| `/api/v1/notifications` | notification-routes |
| `/api/v1/integrations` | integration-routes |
| `/api/v1/telegram-bridge/*` | telegram-bridge-routes |
| `/api/v1/tags` | tag-routes prefix |
| `/api/v1/public/org-branding` | **không JWT** org-branding-routes |
| `/api/public/*` | public-api-routes **X-Api-Key** |

Tài liệu vendor đầy đủ hơn (có thể lệch edition): `docs/zalocrm-api/api-documentation.md`. **Ưu tiên route file** nếu mâu thuẫn.

---

## Request/response pattern `VERIFIED`

- Success: JSON object/array trực tiếp (không envelope chuẩn).
- Error: `{ error: string, code?: string }`.
- Telephony connect-config **trả `sipPassword` plaintext** sau decrypt — chỉ user đang login, HTTPS bắt buộc production (`INFERRED` rủi ro nếu HTTP).

---

## UNKNOWN

Danh sách **đầy đủ** mọi `app.get/post` (hàng trăm). Bảng trên là **map lõi đã grep**, không phải OpenAPI generate.
