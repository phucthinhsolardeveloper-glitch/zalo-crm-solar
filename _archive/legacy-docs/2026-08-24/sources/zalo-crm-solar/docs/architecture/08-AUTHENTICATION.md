# 08 — Authentication & Authorization

**Không ghi secret / JWT thật.**

---

## Login → token `VERIFIED`

```text
POST /api/v1/auth/login { identifier|email, password }
  → auth-service.login
      identifier có @ → email lowercase
      toàn số → phone normalize 84xxx
      bcrypt.compare vs User.passwordHash
  → Fastify JWT sign payload { id, email, role, orgId, tv, typ:'access' }
      expiresIn = ACCESS_TOKEN_TTL default 15m
  → issueRefreshToken: opaque random, lưu sha256, familyId
  → response { token, refreshToken, user: payload+profile }
```

Setup tương tự: `POST /api/v1/setup`.

Hash password: **bcryptjs** cost **12** (setup/login/onboarding), cost **10** (một số `user-routes` create/admin password).

---

## Frontend storage `VERIFIED`

| Key | Nội dung |
|---|---|
| `localStorage.token` | Access JWT |
| `localStorage.refreshToken` | Refresh opaque |
| `auth:refresh-in-progress` | Lock cross-tab |

**Không** thấy httpOnly cookie auth cho SPA (cookie plugin Fastify có thể dùng chỗ khác). Refresh gửi **body JSON**.

Axios gắn `Authorization: Bearer`. Socket dùng cùng access token (`socket-auth.ts` + `ensureFreshToken`).

---

## Refresh / logout `VERIFIED`

- `POST /api/v1/auth/refresh` — rotate; reuse ngoài grace → `RefreshReuseError` 401 `refresh_reuse` (revoke family).
- TTL: `REFRESH_TOKEN_TTL_MS` default 30 ngày; `REFRESH_FAMILY_MAX_MS` 90 ngày; `REFRESH_GRACE_MS` 20s.
- `POST /api/v1/auth/logout` — revoke family nếu có token.

Access token `typ === 'access'`: **không** check `jwtTokenVersion` mỗi request (comment 10A). Revoke password chủ yếu ở refresh + `tv` trên **legacy** JWT không có typ.

`requireActiveUser`: re-check `isActive` DB cho route nhạy (telephony hooks, user admin).

---

## Middleware stack `VERIFIED`

```text
JWT verify (authMiddleware)
  → request.authCtx { userId, orgId, role }
  → enterTenantContext ALS
requireGrant(resource, action) → userHasGrant; owner bypass trong permission service (comment dual-read)
requireZaloAccess(minPermission) → ZaloAccountAccess
privacy redact / OTP
```

Frontend: `canAccess` — **owner và admin = full**; khác đọc `user.grants`.

Legacy `User.role`: `owner | admin | member` (schema). `permissionGroupId` là RBAC mới.

---

## Public / API key `VERIFIED`

| Cơ chế | Dùng cho |
|---|---|
| Không auth | `/health`, `/api/v1/setup/status`, `/api/v1/public/org-branding`, appointment public routes |
| Query `key` | OmiCall webhook `OMICALL_WEBHOOK_SECRET` |
| `X-Api-Key` | `/api/public/*` so với `AppSetting` `public_api_key` **plaintext** trong DB (`valuePlain`) |

---

## Encryption khác password `VERIFIED`

- `ENCRYPTION_KEY` AES (OmiCall SIP secret `omicallExtensionSecret` — `omicall-token.ts`).
- `TOKEN_ENCRYPTION_KEY` / `FB_TOKEN_ENC_KEY` cho token ads (env).
- Refresh: SHA-256 hash, không mã hoá AES.

Production: `JWT_SECRET` và `ENCRYPTION_KEY` **fail-fast** nếu thiếu / <32 / trùng fallback (`config/index.ts`).

---

## First-run `VERIFIED`

`users.count === 0` → `/setup`. Sau login `passwordChangedAt === null` → `/setup-password`.

---

## UNKNOWN

- Cookie session có dùng cho mobile app hay không.
- Rotation policy JWT secret trên VPS thật.
