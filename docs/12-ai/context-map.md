# AI context map

- Mọi task → `AGENTS.md` + file code lân cận.
- Frontend feature → architecture components/request flow + `02-development/testing.md` + feature doc.
- Backend API → `04-api/overview.md` + auth nếu protected + domain module/test.
- Database change → `03-data/database.md`, `data-model.md`, `migrations.md`, `data-safety.md`.
- Authentication/RBAC → `05-security/security-model.md`, `auth-rbac.md`, API auth.
- Zalo/chat → `07-features/crm-zalo.md`, integrations, Zalo/chat modules.
- Telephony/cross-CRM → `07-features/telephony.md`, `08-integrations/README.md`, system integration doc.
- Deployment → `06-operations/deployment.md`, `production.md`, backup/rollback.
- Incident → monitoring, incident-response, relevant component and production snapshot.
- `crm-custom` task → đọc `D:/IT/crm-custom/AGENTS.md` và canonical docs trong repo đó; không áp RBAC ZCRM sang CRM.

Mục tiêu là minimum sufficient context, không ingest toàn bộ archive.
