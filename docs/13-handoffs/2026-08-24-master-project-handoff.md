# Master handoff — CRM Custom + ZCRM Solar — 2026-08-24

Tài liệu này tổng hợp trạng thái, quy tắc, bằng chứng và luồng làm việc để chuyển task cho developer hoặc AI agent khác. Đây là điểm bắt đầu; source code/test/runtime vẫn là nguồn sự thật cao hơn.

## DONE

### 1. Phạm vi đã xử lý

- `D:\IT\crm-custom`
- `D:\IT\zalo-crm-solar`
- Legacy docs từng nằm trực tiếp dưới `D:\IT`
- Canonical documentation, legacy archive, security redaction, Git branch và remote push

Tên “zalo-crm-custom” từng xuất hiện trong trao đổi được hiểu là `zalo-crm-solar`; không phát hiện repository thứ ba cùng tên.

### 2. Documentation reconstruction

Hai repository đã có cấu trúc canonical:

```text
README.md
AGENTS.md
CLAUDE.md
docs/
├── 00-project
├── 01-architecture
├── 02-development
├── 03-data
├── 04-api
├── 05-security
├── 06-operations
├── 07-features
├── 08-integrations
├── 09-decisions
├── 10-audits
├── 11-workflows
├── 12-ai
├── 13-handoffs
├── CHANGELOG.md
└── ROADMAP.md
```

Canonical docs được xây từ code, schema, config, test và runtime evidence. Legacy chỉ là historical evidence.

Các catalog code-derived:

- CRM Custom: 350 route/54 controller và 59-model catalog.
- ZCRM: 375 literal Fastify route theo 55 area; dynamic route vẫn cần source inspection.

### 3. Legacy archive

CRM archive:

```text
D:\IT\crm-custom\_archive\legacy-docs\2026-08-24\
```

- 38 legacy source + `LEGACY-INVENTORY.md` = 39 file.
- 35/38 source khớp Git blob; `CLAUDE.md`, `README.md`, `DEPLOYMENT-GUIDE.md` khác do security redaction.
- Screenshot, diagram và tài liệu dài được giữ nguyên relative path.

ZCRM archive:

```text
D:\IT\zalo-crm-solar\_archive\legacy-docs\2026-08-24\
```

- 67 source ZCRM + 8 source IT-root + inventory = 76 file.
- 59/67 ZCRM source khớp Git blob; 8 file ZCRM và 2 file IT-root được redaction theo inventory.

Crosswalk:

- `crm-custom/docs/10-audits/legacy-crosswalk.md`
- `zalo-crm-solar/docs/10-audits/legacy-crosswalk.md`
- `docs/10-audits/documentation-completeness-review.md` ở từng repo

### 4. Git đã thực hiện

CRM Custom:

```text
branch: master01
pre-handoff baseline: 539d668fb0fb4d0f734da0865c32175924e42f49
working tree: clean trước khi tạo handoff này
```

Các commit chính:

```text
e49e41d docs: reconstruct verified project knowledge
4438a37 security: stop tracking database backups
bfffe29 docs: add comprehensive Git workflow guide
539d668 docs: streamline Git workflow guide
```

ZCRM:

```text
branch: master01
pre-handoff baseline: 896932ddcdf2b7b7d591d3462b723af08c74e377
working tree: clean trước khi tạo handoff này
```

Các commit liên quan:

```text
3385b7f docs: reconstruct verified project knowledge
710c4ed docs: add comprehensive Git workflow guide
03b2ce8 docs: streamline Git workflow guide
896932d fix(security): patch stored XSS, add auth rate-limit, update vulnerable deps
```

Commit `896932d` xuất hiện sau công việc documentation; agent tiếp theo phải đọc diff/test của commit này trước khi dùng các kết luận security cũ.

Git runbook:

- `crm-custom/docs/02-development/git-workflow.md`
- `zalo-crm-solar/docs/02-development/git-workflow.md`

### 5. Database dump hygiene

`crm-custom/backups/postgres_20260818_131320.sql` từng được Git track và có 59 khối dữ liệu, gồm bảng khách hàng, API key và giao dịch. Trên `master01`, file đã được bỏ khỏi tree bằng `git rm --cached`; file local được giữ và `.gitignore` chặn `backups/`, `*.dump`, `*.bak`.

File vẫn tồn tại trong lịch sử cũ của `main`. Nếu chứa dữ liệu/credential thật:

1. rotate credential liên quan;
2. đánh giá quyền truy cập remote;
3. lập task history rewrite riêng nếu bắt buộc;
4. phối hợp mọi clone/branch trước rewrite.

Không tự rewrite shared history.

## VERIFIED

### 1. Ownership và kiến trúc

```text
zalo-crm-solar
Zalo session/chat/friend/contact aggregation + telephony orchestration
        │
        │ event / webhook / call_uuid
        ▼
crm-custom
Lead/Customer/Order/Payment + business workflow
```

Không tạo owner Lead/Customer/Order/Payment thứ hai trong ZCRM. CRM Custom không sở hữu SIP session/recording pipeline.

### 2. Stack và dữ liệu

CRM Custom:

- pnpm/Turbo monorepo.
- NestJS 11 API, Next.js 16 web.
- Prisma 6, PostgreSQL 16, Redis 7/BullMQ.
- 59 models, 15 enums, 18 migrations tại snapshot audit.

ZCRM:

- Vue 3/Vite/Vuetify/Pinia frontend.
- Fastify 5/TypeScript/Prisma 7 backend.
- PostgreSQL 16, Redis 7, local/S3-compatible storage, ClamAV.
- 113 models, 2 enums, 119 migrations tại snapshot audit.

### 3. Authentication/RBAC

CRM Custom:

- Nest API trả token pair; Next BFF giữ HttpOnly cookie.
- Access 1 giờ, refresh 7 ngày theo code snapshot; refresh rotation/hash, reuse grace 30 giây.
- Global throttle mặc định 100 request/phút; login 5/phút, refresh 10/phút.
- SUPER_ADMIN/MANAGER global; MANAGER không department-scoped.
- LEADER self-scope ở lead/customer/task, team scope chỉ được thấy ở một số order query.
- Lead/customer detail read là open-trust cho mọi authenticated role; writes vẫn scoped.

ZCRM:

- Access 15 phút; refresh 30 ngày; family cap 90 ngày; reuse grace 20 giây.
- Global rate limit 1200/phút/user, fallback IP.
- Production audit snapshot có tenant guard off, CSP report-only và RLS set-config false.
- Telephony chưa có grant matrix hoàn chỉnh.

Security conclusions phải được re-check sau ZCRM commit `896932d`.

### 4. Integrations

- ZCRM sở hữu Zalo/ZCA session, listener/reconnect, chat/friend/contact.
- OmiCall/ZCC: browser SIP/WebRTC, webhook/history, `TelephonyCall`, recording và optional CRM relay.
- Terminal CDR relay sang CRM là best-effort; failure không chặn provider webhook.
- CRM Custom có OmiCall ingest/queue, Lark Base sync, dynamic webhook, external API key, push/AI/MCP surface.
- Lark queue: concurrency 1, 5 attempts, exponential backoff base 1 giây; duplicate-crash window chưa được loại bỏ hoàn toàn.
- Storage/AV: ZCRM production snapshot dùng local storage; ClamAV bật fail-closed.

### 5. Test baseline đã chạy

CRM Custom:

```text
API tests: 23 file / 170 test pass
API full build: ENVIRONMENT failure do EPERM tại apps/api/dist
Next build: ENVIRONMENT failure do không tải được Google Fonts
```

ZCRM:

```text
backend: 62 file / 470 test pass
frontend: 5 file / 42 test pass
backend tsc --noEmit: pass
frontend vue-tsc --noEmit: pass
Vite production build: pass
backend emit build: ENVIRONMENT failure do EPERM tại backend/dist
```

Các kết quả là snapshot trước commit security `896932d`; agent tiếp theo phải chạy lại test liên quan nếu tiếp tục ZCRM.

### 6. Production snapshot

ZCRM được quan sát read-only ngày 2026-08-24 tại commit `6c7e99c`:

- app/db/redis/minio/clamav/backup healthy;
- migration up to date;
- `/health` kết nối DB;
- backup Aug-23/Aug-24 khác rỗng và log thành công;
- runtime production, local storage, AV fail-closed;
- automation/friend-invite test/tenant guard/RLS/OmiCall/ZCC disabled hoặc off theo snapshot;
- dùng HTTP/IP, chưa có domain/HTTPS được xác minh.

Snapshot này không đại diện tự động cho HEAD `896932d`; cần deploy/runtime verification mới.

CRM Custom chưa có production runtime evidence trong đợt audit.

### 7. Documentation QA

- Required canonical tree tồn tại ở cả hai repo.
- Markdown local links đã kiểm: `broken_links=0` tại lần QA cuối trước handoff.
- Không phát hiện private key/AWS access key/credential assignment dài theo pattern scan đã chạy.
- Task template và handoff headings đúng chuẩn.
- Archive không bị Git ignore tại lần kiểm.

## REMAINING

### 1. Documentation gaps thật

CRM Custom:

- API contract chi tiết chưa có request DTO/response/status/error/example cho từng endpoint.
- Chưa có runbook riêng đủ sâu cho task/notification/transfer.
- Chưa có page-by-page browser acceptance/current screenshot contract.
- Production topology/runbook chưa thể xác minh vì chưa quan sát runtime.

ZCRM:

- Route catalog chưa phải full request/response API contract; route dynamic cần kiểm thêm.
- Chưa có WebSocket event/payload/reconnect catalog đầy đủ.
- Automation, analytics/report, privacy, customer-list/campaign và AI/RAG chưa có operator guide riêng.
- Local setup chưa được chạy lại trên máy sạch có Docker.
- Production runbook chưa có verified TLS/firewall/provider enable/restore procedure.

Documentation completeness đúng là `VERIFIED_PARTIAL`, không phải `COMPLETE`.

### 2. Product/production blockers

ZCRM:

- Re-test security/auth sau `896932d`.
- Telephony RBAC/grant matrix.
- Controlled test recording đủ hai phía.
- HTTPS/domain, CSP enforce, tenant guard và RLS rollout.
- Restore rehearsal DB + media/config; checksum/off-host/alert.
- Browser E2E role/org/owner và capacity benchmark.
- Status/tag/RBAC dual implementation và analytics placeholder.

CRM Custom:

- Production runtime/topology/build artifact verification.
- Restore rehearsal DB + uploads/config.
- Open-trust lead/customer detail privacy acceptance và negative tests.
- Upload malware scanning evidence.
- Browser E2E cho role/owner/team/department.
- OmiCall/integration regression và capacity benchmark.

### 3. Git/PR

- `master01` đã push ở cả hai repo nhưng chưa có bằng chứng PR/merge trong task này.
- CRM PR base dự kiến `main`.
- ZCRM `master01` bắt đầu từ `fix/omicall-sip-call-history`; phải chọn PR base có chủ đích để tránh kéo commit ngoài scope.
- Không xóa nhánh hoặc rewrite history nếu chưa được owner yêu cầu.

### 4. UpCloud

Một bundle từng được tạo và hash-verify tại:

```text
D:\IT\UpCloud\_archive\legacy-docs\2026-08-24\sources\
```

Khi tạo, bundle có 114 source file, `missing=0`, `hash_mismatch=0`. Tại thời điểm tạo handoff này, `D:\IT\UpCloud` không còn tồn tại trên filesystem. Trạng thái hiện tại: `NEEDS VERIFICATION`. Không tuyên bố cloud backup còn tồn tại; kiểm recycle bin/sync destination hoặc tạo lại từ hai archive repository nếu owner yêu cầu.

## KNOWN ISSUES

- Hai repo chưa đạt production readiness tổng thể: **NOT READY FOR PRODUCTION** theo audit gate.
- Capacity của cả hai hệ thống: `CAPACITY NOT YET BENCHMARKED`.
- Backup khác rỗng không chứng minh restore được.
- ZCRM production snapshot ở commit cũ hơn current branch.
- CRM database dump vẫn có thể tồn tại trong Git history cũ dù đã bị bỏ khỏi current tree.
- Legacy API docs có claim drift; không dùng trực tiếp làm contract.
- Git warning `unable to access C:\Users\ADMIN/.config/git/ignore` xuất hiện trong sandbox; không làm commit/push thất bại.
- LF/CRLF warnings xuất hiện khi stage; không có bulk line-ending normalization chủ đích.

## RELEVANT FILES

Đọc đầu tiên trong mỗi repo:

```text
AGENTS.md
README.md
docs/README.md
docs/00-project/status.md
docs/12-ai/context-map.md
docs/10-audits/documentation-completeness-review.md
docs/10-audits/production-readiness.md
```

Theo domain:

```text
Architecture       docs/01-architecture/
Development/Git   docs/02-development/
Data/Migration    docs/03-data/
API/Auth          docs/04-api/
Security/RBAC     docs/05-security/
Operations/DR     docs/06-operations/
Business flows    docs/07-features/
Integrations      docs/08-integrations/
Audit/Crosswalk   docs/10-audits/
Agent workflow    docs/11-workflows/ + docs/12-ai/
Legacy            _archive/legacy-docs/2026-08-24/
```

Cross-system telephony:

```text
zalo-crm-solar/docs/07-features/telephony.md
zalo-crm-solar/docs/08-integrations/omicall.md
zalo-crm-solar/docs/08-integrations/crm-custom-boundary.md
crm-custom/docs/07-features/telephony-calls.md
crm-custom/docs/08-integrations/omicall-zcrm.md
```

## NEXT

### Quy trình bắt đầu cho agent mới

1. Đọc `AGENTS.md` của repository đang làm.
2. Đọc `docs/12-ai/context-map.md`, status và domain doc tối thiểu.
3. Chạy `git status`, branch, HEAD và remote; không sửa nếu dirty tree chưa rõ ownership.
4. Re-verify fact biến động bằng code/test/runtime; không tin snapshot cũ tuyệt đối.
5. Trả lời: đã có chưa, ai sở hữu, reuse gì, có duplicate owner không.
6. Lập acceptance/negative cases/risk.
7. Implement diff nhỏ tại owner module.
8. Chạy test → typecheck → build → integration/API/browser/runtime theo phạm vi.
9. Phân loại failure.
10. Cập nhật canonical docs và báo cáo tiếng Việt.

### Luồng feature chuẩn

```text
User requirement
→ ownership/boundary
→ UI/BFF/API/service/schema/provider trace
→ acceptance + negative cases
→ implementation
→ target tests
→ typecheck/build
→ smoke/integration/security
→ canonical docs
→ Git review/commit/push/PR
```

### Luồng bug chuẩn

```text
reproduce + timestamp/role/entity/event ID
→ browser/BFF/API/service/DB/queue/provider boundary
→ evidence + failing test
→ root-cause fix tại owner
→ success + negative + side-effect verification
→ docs/incident note nếu behavior vận hành đổi
```

### Luồng cross-repo

```text
system of record
→ sender event + stable identity
→ authentication
→ receiver idempotency/persistence
→ retry/timeout/partial failure
→ reconciliation/observability
→ tests ở cả sender và receiver
```

### Luồng schema/production

Không dùng reset/data-loss command. Review migration SQL, constraint/index/data compatibility, backup và rollback; production chỉ dùng migration đã review và `prisma migrate deploy`. Backup phải được restore rehearsal trước khi gọi là verified.

### Quy tắc giao tiếp và an toàn

- Báo user bằng tiếng Việt.
- Không bịa; dùng `UNKNOWN` hoặc `NEEDS VERIFICATION`.
- Không đọc/in secret, `.env`, PII hoặc production payload.
- Không tự commit/push/deploy/đổi production nếu task chưa cấp quyền.
- Không dùng archive làm current truth.
- Không tuyên bố success chỉ vì build pass.
- Không tuyên bố production-ready khi blocker chưa đóng.
