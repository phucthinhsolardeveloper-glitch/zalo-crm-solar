# ✅ Step 3 Progress: Secrets & RBAC Setup

**Status:** 70% Complete — Secrets Generated, Ready for `.env` Configuration  
**Date:** 2026-08-18  
**Next Action:** Fill `.env.production` files with generated secrets

---

## 🎯 What's Done

### ✅ Secrets Generated (Just Now)

**CRM-CUSTOM:**
```
DB_PASSWORD=<REDACTED_LEGACY_VALUE>
REDIS_PASSWORD=<REDACTED_LEGACY_VALUE>
JWT_SECRET=<REDACTED_LEGACY_VALUE>
JWT_REFRESH_SECRET=<REDACTED_LEGACY_VALUE>
WEBHOOK_SECRET=<REDACTED_LEGACY_VALUE>
SEED_PASSWORD=<REDACTED_LEGACY_VALUE>
```

**ZALO-CRM-SOLAR:**
```
DB_PASSWORD=<REDACTED_LEGACY_VALUE>
JWT_SECRET=<REDACTED_LEGACY_VALUE>
ENCRYPTION_KEY=<REDACTED_LEGACY_VALUE>
FB_WEBHOOK_VERIFY_TOKEN=<REDACTED_LEGACY_VALUE>
FB_TOKEN_ENC_KEY=<REDACTED_LEGACY_VALUE>
ZALO_WEBHOOK_VERIFY_TOKEN=<REDACTED_LEGACY_VALUE>
```

### ✅ Documentation Created

- `RBAC-SECRETS-SETUP.md` — Complete guide (5-page walkthrough)
- `.env.production` templates — Both repos (with instructions)
- `gen-secrets.ps1` — Working secret generator

---

## 📋 Remaining Tasks (Next ~30 minutes)

### 1️⃣ Fill crm-custom/.env.production

```powershell
# 1. Open file
code D:\IT\crm-custom\.env.production

# 2. Find line with "DB_PASSWORD=" and replace:
#    FROM: DB_PASSWORD=[GENERATE-WITH: openssl rand -base64 16]
#    TO:   DB_PASSWORD=Yv5z6QMGXtqAUOWUwW0+BA==
#
# 3. Do the same for:
#    - JWT_SECRET (use value above)
#    - JWT_REFRESH_SECRET (use value above)
#    - WEBHOOK_SECRET (use value above)
#    - SEED_PASSWORD (use value above)
#    - REDIS_PASSWORD (use value above)
#
# 4. Also change:
#    - FRONTEND_URL=https://crm.yourdomain.com (your actual domain or localhost for dev)
#    - NEXT_PUBLIC_API_URL=https://crm.yourdomain.com/api/v1
#    - DATABASE_URL (if using external database)
#
# 5. Save file
```

### 2️⃣ Fill zalo-crm-solar/.env.production

Same process, use ZALO-CRM-SOLAR secrets above.

### 3️⃣ Test Database Seed

```bash
cd D:\IT\crm-custom

# 1. Verify .env.production is ready
type .env.production | findstr "JWT_SECRET\|SEED_PASSWORD" # Windows

# 2. Reset database with new credentials
pnpm db:reset

# 3. Re-seed with new SEED_PASSWORD
pnpm db:seed

# 4. Login test
# URL: http://localhost:3011/login
# Email: admin@crm.local
# Password: <REDACTED_LEGACY_PASSWORD>  (use the SEED_PASSWORD from above)
```

### 4️⃣ Verify RBAC Roles

After successful login, test each role:

| User | Password | Expected Access |
|------|----------|-----------------|
| admin@crm.local | <REDACTED_LEGACY_PASSWORD> | ✅ All menus, all operations |
| manager.sales@crm.local | <REDACTED_LEGACY_PASSWORD> | ✅ Sales menus only |
| sale1@crm.local | <REDACTED_LEGACY_PASSWORD> | ✅ Own leads/orders only |

---

## 🔒 Security Checklist

- [ ] `.env.production` files created (both repos)
- [ ] Secrets filled in (NOT placeholders)
- [ ] `.env.production` added to `.gitignore` (never commit)
- [ ] Database seeded with new SEED_PASSWORD
- [ ] All 4 RBAC roles tested successfully
- [ ] Original demo `.env` files cleaned up (optional)
- [ ] Secrets backed up to secure location (1Password / Vault)

---

## ⏭️ After Completing This Step

✅ **You will have:**
- Production-ready environment configuration
- Database with real passwords (not "changeme")
- RBAC roles verified working
- Admin account accessible with new password

✅ **Next P0 Task:**
- **#1 Legal Audit (AGPL-3.0)** — Still blocking, must do before major development
- **#4 AI Chatbot (PDF/DOCX parser)** — Quick enhancement, vài ngày là xong
- **#5 Omicall production** — Code gần hoàn chỉnh
- **#6 Go-live crm-custom** — Ready to deploy
- **#7 Go-live zalo-crm-solar** — Ready to deploy

---

**Estimated completion:** 30–45 minutes from now  
**Then:** Backup verification + RBAC testing complete all of **P0 Step 3** ✅
