# Data model

## Core graph

```text
Organization
 ├─ User ─ PermissionGroup / DepartmentMember
 ├─ ZaloAccount ─ Friend
 ├─ Contact ─ Conversation ─ Message
 ├─ Appointment / Note / Tag / Score / Engagement
 ├─ TelephonyCall ─ CallNote
 └─ MediaBlob / MediaAsset / Integration / AI config
```

## Invariant quan trọng

- Mọi access business phải giữ `orgId` thống nhất giữa parent/child.
- `Contact` là hồ sơ CRM; `Friend` là quan hệ per-nick. Không merge hai khái niệm.
- Contact có soft merge (`mergedInto`) và conversation có soft delete; Zalo account có archive.
- `TelephonyCall` unique theo `[ownerUserId, providerCallId]`; `CallNote` append-only theo call/phone timeline.
- Refresh token chỉ lưu SHA-256 hash, có family/rotation/reuse detection.
- Recording DB giữ internal reference; bytes mã hoá ở namespace private.

## Dual-read/deprecated state

- `User.role` và `permissionGroupId` song song.
- `Contact.status` và `statusId/Status` song song.
- `CrmTag*` và taxonomy v2 `Tag*` cùng tồn tại.
- Một số Organization automation/Lead Ads model còn trong schema dù Community runtime không register extension.

Cutover/drop cần migration riêng, audit caller và rollback; không được suy ra dead code chỉ từ comment.
