# 14 — Git / GitHub / Branches

Scan **2026-08-20**. Không merge, không đổi branch.

---

## Remote `VERIFIED`

```
origin  https://github.com/phucthinhsolardeveloper-glitch/zalo-crm-solar.git
```

`origin/HEAD` → `origin/main`.

---

## Branches local + remote `VERIFIED`

| Branch | Tip commit (scan) |
|---|---|
| `HEAD` / `fix/omicall-sip-call-history` | `11196b2` ket noi omni - dong bo cuoc goi |
| local `main` | **cùng** `11196b2` |
| `origin/fix/omicall-sip-call-history` | `11196b2` |
| `origin/main` | `4b123cb` update ai nhap pdf-doc - run - fix error |

`git rev-list --left-right --count origin/main...HEAD` → **0 1**: HEAD **nhanh hơn origin/main 1 commit**.

`git log main..HEAD` **rỗng** vì local main = HEAD.

`git diff main...HEAD` **rỗng** — **không có khác biệt commit** giữa local main và fix branch.

---

## So sánh `main` vs `fix/omicall-sip-call-history`

### Commits

**VERIFIED:** hai branch local **trùng snapshot**. Tên branch fix **không** chứa commit riêng so với local main.

### origin/main vs fix (1 commit)

Commit `11196b2` (~2026-08-19) **50 files**, +1608/−204, gồm:

- Telephony: `omicall-agent-provisioning.ts`, `omicall-crm-forward.ts`, `omicall-directory.ts`, history-sync/public-routes/telephony-routes tweaks
- Config `CRM_CUSTOM_OMICALL_*`
- AI virtual chat prompts/schemas/routes + tests
- Branding org + CSS tokens Phúc Thịnh
- `CreateUserWithZaloModal` OmiCall provision hint
- `.env.example` OmiCall API URL tweak
- Prisma/schema 2 dòng + 3 migration.sql nhỏ

**Không** tách “chỉ SIP” — commit trộn AI + branding + OmiCall.

### Working tree (chưa commit) trên branch fix `VERIFIED`

`git status`: 6 file modified:

| File | Hướng (stat) |
|---|---|
| `CHANGELOG.md` | + |
| `backend/src/modules/auth/user-routes.ts` | +38 (omicall-auto-provision API) |
| `backend/src/modules/telephony/omicall-history-sync.ts` | sync logic |
| `frontend/src/api/index.ts` | skipErrorToast 5xx |
| `frontend/src/components/rbac/UserEditPanel.vue` | UI auto-provision |
| `frontend/src/composables/use-omicall-softphone.ts` | softphone |

Đây mới là **WIP call-history/SIP** so với `11196b2`. **UNKNOWN** khi nào được commit/push.

---

## Remote khác `VERIFIED` tồn tại (không checkout)

- `origin/feat/ai-chatbot-openai`
- `origin/feat/omicall-phone-bridge`
- `origin/feat/stringee-phone-bridge`
- `origin/feat/zalo-call-log-recording`

Nội dung chi tiết từng feat: **không** diff trong phase này (tránh đổi branch). `feat/omicall-phone-bridge` đã merge PR #4 vào lịch sử `f557b36`.

---

## File / feature / DB / config differences

| Hạng mục | local main vs fix (committed) | vs origin/main | vs working tree |
|---|---|---|---|
| Source | Identical | +11196b2 | WIP 6 files |
| Database migrations | Identical | migrations trong 11196b2 (nhỏ) | **Không** thấy migration mới uncommitted |
| Config | Identical | CRM_CUSTOM + OmiCall example | user-routes API mới |

---

## Workflow phù hợp repo này `INFERRED` (không có CODEOWNERS/CI)

```text
main                    # production-ish; origin/main đang chậm 1 commit
  → feat/* hoặc fix/*   # nhánh lẻ trên origin
  → commit + push
  → GitHub PR (đã có merge PR #4)
  → review thủ công (không Actions)
  → merge main
  → trên VPS: git pull + zalocrm-deploy.sh / compose build
```

Hiện **lệch**: local `main` đã có `11196b2` nhưng **chưa** (hoặc chưa) khớp `origin/main`. Fix branch **đã** push `11196b2`. Rủi ro: người clone `origin/main` thiếu commit OmiCall sync.

---

## UNKNOWN

- Protected branch / rule GitHub (cần API GitHub, không đọc từ disk).
- Ai deploy production từ branch nào.
