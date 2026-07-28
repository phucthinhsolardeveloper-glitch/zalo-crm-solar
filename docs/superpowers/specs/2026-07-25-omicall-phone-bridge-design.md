# Omicall phone bridge — design

Date: 2026-07-25
Branch: `feat/omicall-phone-bridge` (worktree, based on `main`)
Supersedes: Stringee telephony integration on `feat/stringee-phone-bridge` (untouched, parallel work — do not merge/rebase against it).

## Goal

Rewrite the browser softphone (internal calls, web→phone, phone→web) on top of Omicall instead of Stringee. Same three call flows, same UX shape as the existing Stringee softphone (`TelephonySoftphone.vue`), different provider underneath.

## Why Omicall's model differs from Stringee's

Stringee: server mints a short-lived signed JWT identity token per user on demand (`stringee-token.ts`) — no per-user secret stored, any `userId` can get a token.

Omicall Web SDK v3: browser registers with `OMICallSDK.register({ sipRealm, sipUser, sipPassword })` — `sipUser`/`sipPassword` are a real, pre-provisioned PBX extension credential pair. There is no server-side token minting; the extension must already exist in the Omicall dashboard, and the password is a durable secret, not a scoped/expiring token.

Consequence: each CRM agent needs one Omicall extension assigned up front, and the CRM must store the extension password (encrypted) to hand to the browser at connect time.

Internal calls, outbound-to-PSTN, and inbound-from-PSTN are all routed by the Omicall PBX itself (ring groups / IVR / trunk configured in the Omicall dashboard) — the CRM backend does not implement call-routing scripting (no analog to Stringee's Answer-URL SCCO). Backend responsibilities shrink to: issuing connect credentials, providing the internal directory, logging calls, and reconciling call state from webhooks.

## Data model

`User` — two new columns (migration required):
- `omicallExtension String?` — sipUser, unique per org
- `omicallExtensionSecret String?` — sipPassword, AES-256-GCM encrypted at rest via `backend/src/shared/crypto/aes-gcm.ts`, keyed explicitly with `config.encryptionKey` (not the `FB_TOKEN_ENC_KEY` fallback the util defaults to)

Both nullable — a user with no extension assigned simply can't use the softphone (mirrors today's `enabled`/503 pattern).

`TelephonyCall` — **no schema change**. The model already has `provider String @default("stringee")`; new rows get `provider: 'omicall'`. `providerCallId` stores Omicall's `transaction_id` (stable per logical call), not `call_uuid` (changes per leg/transfer) — this keeps the existing `@@unique([ownerUserId, providerCallId])` constraint meaningful.

## Config

Replace `STRINGEE_*` env vars with:
- `OMICALL_ENABLED`
- `OMICALL_DOMAIN` — sipRealm
- `OMICALL_HOTLINE` — outbound caller-ID number for web→phone
- `OMICALL_WEBHOOK_SECRET` — Omicall webhooks have **no built-in signature/HMAC** (confirmed against current Omicall API docs — dashboard config is just an HTTPS URL, no auth mechanism offered). Mitigate by embedding this secret as a query param in the webhook URL registered on the Omicall dashboard (e.g. `https://.../api/v1/telephony/omicall/events?key=<secret>`), checked server-side. This replaces Stringee's `project_id` check.

`config/index.ts`: add these alongside removal of the `stringee*` keys; same fail-soft pattern (feature returns 503 if unconfigured, no boot-time hard failure — matches current Stringee behavior, not the JWT_SECRET/ENCRYPTION_KEY hard-fail class).

## Backend routes

`backend/src/modules/telephony/omicall-token.ts` (replaces `stringee-token.ts`):
- `decryptOmicallSecret(user)` → plaintext sipPassword, or null if not configured
- No JWT signing needed — this module is now just the encrypt/decrypt + lookup helper

`backend/src/modules/telephony/telephony-routes.ts` (authenticated, same file name/shape as today):
- `GET /api/v1/telephony/omicall/connect-config` — returns `{ enabled, sipRealm, sipUser, sipPassword, hotline, peers }` for the current user (peers = other active org users + their `omicallExtension`). 503 if Omicall disabled or current user has no extension assigned.
- `GET /api/v1/telephony/calls` — unchanged (provider-agnostic already)
- `POST /api/v1/telephony/calls` — unchanged shape (peerUserId xor phoneNumber + direction), still creates the log row for the client-initiated flows (frontend still creates a row optimistically as it does today; webhook reconciles).
- `PATCH /api/v1/telephony/calls/:id` — unchanged

`backend/src/modules/telephony/omicall-public-routes.ts` (replaces `stringee-public-routes.ts`, no auth preHandler):
- `POST /api/v1/telephony/omicall/events?key=...` — webhook receiver. Validates `key`. Maps Omicall `state` (`create`/`early`/`ringing`/`answered`/`hangup`) → our `status` enum (`initiated`/`ringing`/`answered`/`completed`/`missed`/`rejected`/`failed`), using `bill_sec`/`answer_sec` the way `mapStringeeEventStatus` uses `answerDuration` today to distinguish completed vs. missed vs. rejected on hangup. Upserts by `transaction_id`: if no `TelephonyCall` row exists yet (pure phone→web inbound, or agent didn't hit `POST /calls` in time), create one — resolve `ownerUserId` from `extension` → `User.omicallExtension`, resolve `contactId` from `phone_number` the same way `POST /calls` does today (`normalizePhone` + `phoneVariants` lookup against `Contact`).

Register both in `app.ts` where `stringeePublicRoutes`/`telephonyRoutes` are registered today.

## Frontend

`frontend/src/composables/use-omicall-softphone.ts` (replaces `use-stringee-softphone.ts`):
- Loads `OMICallSDK` via the CDN script tag (`https://cdn.omicrm.com/sdk/web/{version}/core.min.js`), same lazy-load pattern as `loadSdk()` today
- `OMICallSDK.init(...)` then `OMICallSDK.register({ sipRealm, sipUser, sipPassword })`
- Events: `register` (connecting/connected/disconnect → phase), `ringing`/`accepted`/`ended` (→ phase + `patchLog`), incoming call surfaced via SDK's incoming event → same `handleIncoming`-shaped flow
- Outbound: `OMICallSDK.makeCall(remoteNumber, { isVideo: false })` for both internal (dial extension) and external (dial phone number) — single call path, no `from`/`to` pair construction needed (PBX handles routing based on the registered extension's own outbound rules)
- Call log CRUD calls (`POST/PATCH /telephony/calls`) — same client-side bookkeeping as today

`frontend/src/components/telephony/TelephonySoftphone.vue`: swap composable import, rebrand `STRINGEE WEBRTC` → `OMICALL`, `#stringee-remote-audio` id → `#omicall-remote-audio`. Structure/CSS otherwise unchanged.

## Admin config UI

Add extension assignment to existing user management (Settings > Users, admin-only): two fields per user, `omicallExtension` (plain) and `omicallExtensionSecret` (write-only password input, never echoed back — same UX pattern as any "set new password" field). New PATCH endpoint, RBAC-gated to admin/owner.

## Testing

- Port `backend/tests/stringee-token.test.ts` → `omicall-token.test.ts`: covers encrypt/decrypt round-trip instead of JWT shape assertions (JWT signing logic goes away entirely).
- New test for the webhook status-mapping function (`mapOmicallEventStatus`), mirroring `mapStringeeEventStatus`'s existing test coverage if any exists elsewhere.
- New test for `POST /omicall/events` webhook auth (`key` mismatch → 403).

## Out of scope

- Click-to-call REST API (`/api/click2call`) — not needed; the browser SDK dials directly.
- Call recording — not covered by this rewrite (Stringee's `record` SCCO action doesn't have a direct analog investigated yet; Omicall recording is presumably a PBX-side dashboard setting, `recording_file_url` already appears in the webhook payload so it can be wired into `recordingId` in a follow-up without blocking this feature).
- Multi-domain / per-org Omicall account — config stays global env vars, matching today's Stringee setup (one deployment = one Omicall domain).
