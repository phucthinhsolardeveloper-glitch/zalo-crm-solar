# Legacy-to-canonical crosswalk

Crosswalk này chứng minh nội dung cũ được **lưu trữ và tái thẩm định**, không bị xóa khỏi lịch sử. Bản nguyên văn non-secret nằm tại `_archive/legacy-docs/2026-08-24/sources/zalo-crm-solar/`; canonical docs mô tả trạng thái hiện tại. Security redaction được ghi trong inventory.

## Root guides và governance

| Legacy source | Nội dung được giữ/tái dựng | Canonical home | Kết quả |
|---|---|---|---|
| `README.md` | feature, stack, setup, command, architecture, production caveat | root `README.md`, `docs/00-project/`, `01-architecture/`, `02-development/` | Rebuilt và bổ sung trạng thái kiểm chứng |
| `HUONG-DAN-CAI-DAT.md`, `DOCUMENT-QUY-TRINH-SETUP-RUN.md` | prerequisite, local/Docker/hybrid start, migration, smoke, troubleshooting | `docs/02-development/local-setup.md`, `commands.md`, `environment.md`, `testing.md` | Giữ workflow hợp lệ; loại claim/config drift |
| `CONTRIBUTING.md` | branch/change/test/review discipline | `AGENTS.md`, `docs/11-workflows/` | Chuẩn hóa verification và data safety |
| `SECURITY.md` | secret, auth, reporting/hardening | `docs/05-security/` | Mở rộng RBAC/tenant/production gap |
| `CHANGELOG.md` | lịch sử release cũ | archive; `docs/CHANGELOG.md` cho reconstruction/current | Không rewrite lịch sử |

## Bộ architecture 00–16

| Nhóm legacy | Fact/diagram đã bảo tồn | Canonical home | Drift/ghi chú |
|---|---|---|---|
| `00-SYSTEM-OVERVIEW`, `SYSTEM-MAP` | actor, frontend/backend, PostgreSQL/Redis/storage/provider boundary | `docs/01-architecture/overview.md`, `components.md`, `dependency-map.md` | Re-verify bằng manifests/compose/source |
| `01-REPOSITORY-STRUCTURE`, `02-TECH-STACK` | layout và stack | root `README.md`, `docs/00-project/overview.md`, `docs/01-architecture/components.md` | Version lấy từ lock/manifests hiện tại |
| `03-FRONTEND`, frontend `README.md` | Vue/Pinia/Vuetify, route/API/realtime flow | `docs/01-architecture/frontend.md`, `docs/02-development/frontend.md` | Bổ sung build/test và current owner |
| `04-BACKEND`, module diagram | Fastify modules, middleware/service/cron/worker | `docs/01-architecture/backend.md`, `components.md` | Catalog code hiện tại thay static list |
| `05-API` | prefix, auth, response/error, route groups | `docs/04-api/` và `route-catalog.md` | Catalog chứa 375 literal route; dynamic registration có cảnh báo |
| `06-DATABASE`, data diagrams | Prisma/PostgreSQL entity groups và relation | `docs/03-data/` | Schema hiện tại 113 models/119 migrations là source |
| `07-CRUD-FLOWS` | Zalo/contact/chat/status/tag CRUD flow | `docs/07-features/business-flows.md`, feature docs | Dual status/tag ghi là debt, không che drift |
| `08-AUTHENTICATION` | login/access/refresh/session/revoke | `docs/04-api/authentication.md`, `docs/05-security/auth-rbac.md` | TTL hiện tại access 15m, refresh 30d/family 90d |
| `09-INTEGRATIONS` | Zalo/OmiCall/Telegram/storage/AI/ads | `docs/08-integrations/` | Tách file theo integration, ghi runtime unknown/disabled |
| `10-DOCKER`, `13-DEPLOYMENT` | image/service/volume/deploy order | `docs/01-architecture/deployment.md`, `docs/06-operations/` | Bổ sung production snapshot và restore gap |
| `11-LOCAL-DEVELOPMENT`, `12-ENVIRONMENT` | setup, command, env groups | `docs/02-development/` | Không sao chép giá trị secret |
| `14-GIT-BRANCHES`, `15-CHANGE-IMPACT` | branch/review/impact checklist | `docs/11-workflows/` | Không tuyên bố CI/CD khi repo chưa có |
| `16-TROUBLESHOOTING` | symptom/layer diagnostics | `docs/02-development/troubleshooting.md`, `docs/11-workflows/debugging-workflow.md` | Bổ sung failure classification |

Các file `.excalidraw`, `.mmd`, `.png`, `.svg` được giữ nguyên trong archive để xem sơ đồ lịch sử. Canonical text không coi diagram cũ là current nếu schema/component đã drift.

## API artifacts

| Legacy source | Nội dung | Canonical/current handling |
|---|---|---|
| `docs/zalocrm-api/api-documentation.md`, `api-documentation-vi.md` | endpoint/auth/payload examples | Contract nền chuyển vào `docs/04-api/`; route reality được regenerate ở `route-catalog.md` |
| `api-documentation-vi.pdf` | bản phát hành PDF | Giữ binary nguyên vẹn trong archive; không coi là current |
| `postman-collection.json` | request collection lịch sử | Giữ để khảo cổ/manual test; token/base URL/route phải cập nhật trước dùng |

Legacy claim token 7 ngày không còn đúng; code hiện tại dùng access 15 phút và refresh lifecycle riêng. Đây là ví dụ lý do archive không thể làm source of truth.

## Production, security và integration guides

| Legacy source | Fact/quy trình có giá trị | Canonical home | Trạng thái hiện tại |
|---|---|---|---|
| `FINAL-PRE-PRODUCTION-AUDIT-2026-08-21.md` | issue/evidence telephony, recording, environment/readiness | `docs/10-audits/current-state.md`, `production-readiness.md` | Re-verify 2026-08-24; kết luận vẫn NOT READY |
| `VAN-HANH-VPS-PRODUCTION-PTS.md` | topology, health/log/backup/deploy operations | `docs/06-operations/production.md`, deployment/monitoring/rollback | Snapshot runtime đã kiểm read-only; secret bị loại |
| `HUONG-DAN-TRIEN-KHAI-PRODUCTION-COMMUNITY.md` | preflight/build/migrate/health/rollback | `docs/06-operations/deployment.md`, `production.md` | Giữ safe commands; cấm volume/data destructive path |
| `HUONG-DAN-CAU-HINH-CLOUDFLARE-R2.md` | R2/S3-compatible setup và public/private URL concern | `docs/08-integrations/storage-antivirus.md`, environment | Production thực tế dùng local storage |
| `HUONG-DAN-CAU-HINH-TELEGRAM-BRIDGE.md` | bot/topic/bridge setup | `docs/08-integrations/telegram.md` | Credential/runtime/retry cần verify |
| OmiCall phone bridge plan/design, ZCC design | intended SIP/webhook/history/recording/provisioning/CRM relay | `docs/07-features/telephony.md`, `docs/08-integrations/omicall.md`, `crm-custom-boundary.md` | Design không chứng minh runtime; production flag disabled |

## Handoff, release images và feature evidence

- `docs/handoffs/*`: giữ toàn bộ snapshot tiến độ AI/chatbot và full-system audit. Fact còn giá trị được chuyển vào feature/integration/audit docs; handoff không còn là canonical.
- `docs/release-images/*`: giữ QR và ảnh UI v3.3/v3.4 theo nguyên cây để không mất release evidence. Ảnh không chứng minh UI hiện tại hoặc feature production.
- `docs/superpowers/*`: giữ plan/spec như design history; implementation status được quyết định bằng code/test/runtime.

## Quy tắc kiểm ngược

Khi người đọc thấy canonical thiếu một chi tiết cũ: mở source trong archive, xác định claim, tìm evidence hiện tại, rồi cập nhật đúng canonical owner với trạng thái `VERIFIED_CURRENT`, `VERIFIED_PARTIAL`, `UNKNOWN` hoặc `DEPRECATED`. Không chép secret trở lại và không sửa archive để làm lịch sử “khớp” hiện tại.
