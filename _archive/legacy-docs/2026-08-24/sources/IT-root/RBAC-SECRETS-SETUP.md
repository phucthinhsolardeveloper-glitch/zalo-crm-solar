# Production Secrets & RBAC Setup Guide

**Last Updated:** 2026-08-18  
**Status:** P0 — Before Go-Live  
**Scope:** Configure production environment variables and seed RBAC for both systems

---

## 📋 Overview

Before deploying to production, you must:
1. ✅ **Generate strong secrets** (JWT, database passwords, encryption keys)
2. ✅ **Create `.env.production` files** with real credentials
3. ✅ **Seed admin account** with production password (NOT "changeme")
4. ✅ **Verify RBAC** — 4 roles configured (SUPER_ADMIN, MANAGER, LEADER, USER)
5. ✅ **Document credentials** — store securely (not in git)

---

## 🔐 Step 1: Generate Production Secrets

### On Windows (PowerShell)

```powershell
# Navigate to scripts folder
cd D:\IT\scripts

# Run secret generator
& ".\generate-secrets.ps1"
```

**Output example:**
```
JWT_SECRET=<REDACTED_LEGACY_VALUE>
DB_PASSWORD=<REDACTED_LEGACY_VALUE>
SEED_PASSWORD=<REDACTED_LEGACY_VALUE>
...
```

**⚠️ Important:** This generates RANDOM secrets each run. Save them somewhere safe before closing the terminal!

### Alternative: Manual Generation (Linux/Mac/WSL)

```bash
# Generate 32-byte hex secret (for JWT, encryption keys)
openssl rand -hex 32

# Generate 16-byte base64 secret (for database/redis passwords)
openssl rand -base64 16

# Generate 16-byte hex verify token (for webhooks)
openssl rand -hex 16
```

---

## 📝 Step 2: Update `.env.production` Files

### 2.1 crm-custom/.env.production

**Currently:** Template with `[GENERATE-WITH]` placeholders

**Action:**
```powershell
# 1. Open file in editor
code D:\IT\crm-custom\.env.production

# 2. Replace placeholders:
#    - [GENERATE-WITH: openssl rand -hex 32] → Copy JWT_SECRET from Step 1
#    - [CHANGE-ME: min 8 chars] → Set SEED_PASSWORD (example: "AdminPass123!")
#    - Database: localhost → Production server (if using external DB)
#    - FRONTEND_URL: https://crm.yourdomain.com
#    - NEXT_PUBLIC_API_URL: https://crm.yourdomain.com/api/v1

# Example completed section:
JWT_SECRET=<REDACTED_LEGACY_VALUE>
DB_PASSWORD=<REDACTED_LEGACY_VALUE>
SEED_PASSWORD=<REDACTED_LEGACY_VALUE>
FRONTEND_URL=https://crm.yourdomain.com
NEXT_PUBLIC_API_URL=https://crm.yourdomain.com/api/v1
```

**Checklist:**
- [ ] All `[GENERATE-WITH]` replaced with actual hex secrets
- [ ] All `[CHANGE-ME]` filled with production values
- [ ] `FRONTEND_URL` and `NEXT_PUBLIC_API_URL` use HTTPS (not localhost)
- [ ] Database credentials match your production database
- [ ] `SEED_PASSWORD` changed from demo default
- [ ] File saved (do NOT commit to git)

### 2.2 zalo-crm-solar/.env.production

**Same process:**
```powershell
code D:\IT\zalo-crm-solar\.env.production

# Replace:
JWT_SECRET=<REDACTED_LEGACY_VALUE>
ENCRYPTION_KEY=<REDACTED_LEGACY_VALUE>
DB_PASSWORD=<REDACTED_LEGACY_VALUE>
APP_URL=https://zalo.yourdomain.com
# ... etc
```

**Critical settings for zalo-crm-solar:**
- `ZALO_OA_ID` — Must get from Zalo Business Admin (blocking for go-live)
- `ZALO_ACCESS_TOKEN` — 60-day expiration, needs refresh before expiry
- `APP_URL` — Must match Zalo webhook configuration

---

## 👥 Step 3: Seed Admin Account (RBAC)

### Current Demo Users (from seed)

crm-custom has 8 users seeded automatically:
- **admin@crm.local** — SUPER_ADMIN (all permissions)
- **manager.sales@crm.local** — MANAGER (sales team lead)
- **leader.sales@crm.local** — LEADER (sales team lead assistant)
- **sale1@crm.local** — USER (sales rep)
- **support1@crm.local** — USER (support rep)
- 3 more demo users

**Current password:** `changeme` (demo only)

### For Production

**Option A: Keep seeded users, just change password**

```bash
cd D:\IT\crm-custom

# 1. Make sure .env.production is ready with new SEED_PASSWORD
# 2. Reset database (WARNING: loses all data!)
pnpm db:reset

# 3. Re-seed with new password
pnpm db:seed

# 4. Login test
# URL: http://localhost:3011/login
# Email: admin@crm.local
# Password: <your-new-SEED_PASSWORD>
```

**Option B: Keep existing data, manually update admin password**

```bash
# 1. Connect to production database
docker exec crm-postgres psql -U crm -d crm_v4

# 2. Inside psql shell, update password (hashed with bcrypt)
# ⚠️ This requires the password to be pre-hashed — not recommended
# Better to use the API or seed:

# 3. Exit psql (\q)
```

**Recommended:** Use Option A (db:reset + db:seed) for clean production setup.

### Verify RBAC After Seeding

```bash
# Login as each role and verify permissions:
# 1. SUPER_ADMIN (admin@crm.local) → All menus visible
# 2. MANAGER (manager.sales@crm.local) → Sales management menus
# 3. USER (sale1@crm.local) → Limited to own leads/orders
```

**Expected Role Permissions (crm-custom):**

| Role | CRM | Orders | Payments | Dashboard | Settings |
|------|-----|--------|----------|-----------|----------|
| SUPER_ADMIN | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| MANAGER | ✅ Own Dept | ✅ View All | ✅ View | ✅ Own Dept | ❌ No |
| LEADER | ✅ Own Team | ✅ Own Team | ✅ View | ✅ Own Team | ❌ No |
| USER | ✅ Own Leads | ✅ Own Orders | ❌ No | ✅ KPI Only | ❌ No |

---

## 🔒 Step 4: Secure Credentials

### DO ✅

- [ ] **Store `.env.production` locally** on server only (never commit to git)
- [ ] **Use `.gitignore`** to exclude `.env.production`
- [ ] **Rotate secrets quarterly** — especially `SEED_PASSWORD` and API keys
- [ ] **Back up secrets securely** — use pass manager (1Password, LastPass, Vault)
- [ ] **Limit access** — only give `.env.production` to operations team
- [ ] **Audit access logs** — who accessed prod secrets?

### DON'T ❌

- ❌ **Never commit `.env.production` to git**
- ❌ **Never share secrets via email or Slack**
- ❌ **Never use demo passwords in production** ("changeme", "password", etc.)
- ❌ **Never hardcode secrets in code**
- ❌ **Never log secrets** (passwords, tokens, keys)
- ❌ **Never leave secrets in clipboard** after pasting

### Secret Storage (Recommended)

**Development:** Local `.env.local` (git-ignored)
```
D:\IT\crm-custom\.env.production ← Keep locally, never commit
```

**Production:** Use secrets management
- **Option 1:** AWS Secrets Manager
- **Option 2:** HashiCorp Vault
- **Option 3:** Locked folder on secure server
- **Option 4:** 1Password / LastPass with team access

---

## 🚀 Step 5: Deployment Checklist

Before deploying, verify:

### crm-custom
- [ ] `.env.production` created with all secrets
- [ ] `DATABASE_URL` points to production database (not localhost)
- [ ] `JWT_SECRET` changed from demo (32 bytes minimum)
- [ ] `SEED_PASSWORD` changed from demo
- [ ] `FRONTEND_URL` and `NEXT_PUBLIC_API_URL` use HTTPS
- [ ] Run `pnpm db:push` to sync schema to production database
- [ ] Run `pnpm db:seed` to create users with new password
- [ ] Test login with `admin@crm.local` / new password
- [ ] Verify all 4 roles work correctly (SUPER_ADMIN, MANAGER, LEADER, USER)

### zalo-crm-solar
- [ ] `.env.production` created with all secrets
- [ ] `ZALO_OA_ID` and `ZALO_ACCESS_TOKEN` obtained from Zalo Business Admin
- [ ] `APP_URL` matches Zalo webhook configuration
- [ ] `JWT_SECRET` and `ENCRYPTION_KEY` changed
- [ ] Database migrations run
- [ ] Test with sample Zalo message → verify lead import

---

## 📅 Post-Go-Live Tasks

### Week 1
- [ ] Verify all users can login with new password
- [ ] Test backup/restore procedure
- [ ] Monitor error logs for auth issues

### Month 1
- [ ] Rotate `ZALO_ACCESS_TOKEN` before 60-day expiration
- [ ] Review audit logs for suspicious access
- [ ] Change SEED_PASSWORD (if still using demo users)

### Quarterly
- [ ] Rotate all long-lived secrets (JWT, database passwords)
- [ ] Audit who has access to `.env.production`
- [ ] Verify backup encryption keys are stored separately

---

## 🆘 Troubleshooting

### "Invalid password" after login

**Cause:** Password hash mismatch (old password with new DB)  
**Fix:** Run `pnpm db:seed` to re-seed with correct password

### "Connection refused" to database

**Cause:** `.env.production` DATABASE_URL wrong or database offline  
**Fix:** 
```bash
# Test connection
psql -U crm -d crm_v4 -h <host> -p 5433
```

### "JWT_SECRET is invalid" on app startup

**Cause:** JWT_SECRET is not 32+ bytes hex  
**Fix:** Regenerate using `openssl rand -hex 32`

### "Missing ZALO_ACCESS_TOKEN" in zalo-crm-solar

**Cause:** Not obtained from Zalo Business Admin  
**Fix:** Contact Zalo representative to get access token

---

## 📞 Contact & Support

- **Issues:** Check error logs in `docker logs <container>`
- **Secrets lost?** Regenerate and re-seed database
- **Database corrupt?** Restore from backup (see BACKUP-RESTORE-PROCEDURE.md)

---

## Summary

| Step | Action | Status |
|------|--------|--------|
| 1 | Generate secrets with script | ✅ Ready |
| 2 | Update `.env.production` files | 📝 Next |
| 3 | Seed admin accounts | 📝 Next |
| 4 | Verify RBAC roles | ✅ Built-in |
| 5 | Test login with new password | 📝 Next |

**Estimated time:** 30–45 minutes to complete all steps.
