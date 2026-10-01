# Handoff — Tranche 2/3 follow-up: kill switch, backup đầy đủ, RLS policy coverage

Ngày: 2026-09-30. Bối cảnh: tiếp tục 4 việc an toàn (A1–A4) còn tồn đọng sau
[Mô hình vận hành Zalo an toàn](../09-decisions/20260929-zalo-safe-operating-model.md),
thực hiện thay Codex (đã dừng phiên) theo yêu cầu user.

## DONE

- **A1 — Verify RBAC telephony:** đối chiếu dữ liệu thật (2 user, không có nhóm
  quyền tuỳ chỉnh). Đóng P1 trong `production-readiness.md`.
- **A4 — Kill switch theo nick:** thêm `ZaloAccount.sendingPausedAt/Reason/ById`
  (migration `20260930103800_zalo_account_sending_pause`), module
  `zalo-kill-switch.ts` (cache 5s), route `zalo-kill-switch-routes.ts`
  (`POST .../pause-sending`, `.../resume-sending`, admin-only, có audit log
  `ActivityLog`), gate trong `zalo-operations.ts` (throw `SENDING_PAUSED` trước
  khi `reserve()` quota). 5 test mới (`tests/zalo-kill-switch.test.ts`).
- **A3 — Backup đầy đủ + GFS retention (2026-09-30 phần 2):**
  - `scripts/backup-full.sh`: DB + toàn bộ volume media + config (.env,
    docker-compose.yml, chmod 600) + checksum SHA-256. Set ghi vào
    `backups/full/daily/<timestamp>/`; nếu đúng Chủ Nhật cũng hard-link
    (`cp -al`, không tốn thêm dung lượng) vào `weekly/`, nếu ngày 1 đầu tháng
    cũng hard-link vào `monthly/`. Mỗi bucket giữ số set riêng:
    `BACKUP_KEEP_DAILY=3 / WEEKLY=2 / MONTHLY=2` (biến env, chỉnh được).
  - **Phát hiện quan trọng:** container `zalo-crm-backup` (DB-only, GFS có sẵn
    từ trước qua image `prodrigestivill/postgres-backup-local`) **không hề
    chạy** — backup tự động gần nhất là **29/8** (hơn 1 tháng không backup!).
    Đã start lại (`docker compose up -d backup`) + thêm `backup` vào
    `CORE_SERVICES` trong `zalocrm-deploy.sh` (trước đó bị liệt "tuỳ chọn").
  - Viết lại `scripts/prune-backups.sh`: từ "giữ 2 bản DUY NHẤT gộp chung mọi
    thư mục" → giữ riêng số lượng theo từng bucket (`BACKUP_KEEP_DAILY=7 /
    WEEKLY=4 / MONTHLY=6` cho DB, set qua env trong `docker-compose.yml`).
    Vẫn giữ cơ chế hash-collapse thành hard link để 1 bản trùng nội dung ở
    nhiều bucket không nhân bản dung lượng.
  - Đã chạy thử thật (`docker exec zalo-crm-backup /backup.sh`) — xác nhận
    daily/weekly/monthly/last đều ghi đúng, hook mới prune đúng theo giới hạn
    riêng từng bucket, link count=4 xác nhận dedup hoạt động.
  - Cài cron host (`crontab -l`): `30 2 * * *` chạy `backup-full.sh`, log ra
    `backups/logs/backup-full-cron.log`.
- **A2 — RLS policy coverage:** áp dụng toàn bộ `tenant-rls.sql` lên DB hiện tại
  (trước đó 3/74 bảng, giờ 92/92 bảng có RLS + policy). User tự chạy lệnh do bị
  auto-mode classifier chặn khi tôi thử chạy trực tiếp. **Quyết định user:
  KHÔNG cutover sang role hạn chế** (chỉ 1 org, rủi ro thực tế bằng 0 lúc này).
- **UI kill switch (2026-09-30 phần 2):** thêm nút "Tạm dừng gửi"/"Mở lại" vào
  `NickGridCards.vue` (tab Đơn giản), gate hiển thị bằng `canPauseSending`
  (owner/admin org HOẶC `ZaloAccountAccess.permission='admin'` — hẹp hơn
  `canManage` cố ý, khớp luật `requireAccountAdmin` backend). Thêm field
  `sendingPausedAt/Reason` + `canPauseSending` vào cả `GET /zalo-accounts` và
  `GET /zalo-accounts/enriched` (2 route khác nhau, cả 2 đều cần sửa vì
  `NickGridCards` nhận data từ `enriched`). Dùng `confirmWithReason()` có sẵn
  để bắt nhập lý do khi tạm dừng.
- **ClamAV (phát hiện ngoài phạm vi A1-A4, đã xử lý):** container chưa từng
  chạy dù có sẵn trong compose → toàn bộ media bị `FAIL-CLOSED` chặn ngầm.
  User chọn bật (`docker compose up -d clamav`) thay vì tắt an toàn quét.
  Verify: healthy ngay (dùng volume `clamav_data` cũ), TCP connect
  `clamav:3310` từ app container OK, hết log lỗi `ENOTFOUND clamav`.
- Cập nhật canonical docs: `docs/10-audits/production-readiness.md` (3 mục P1),
  `docs/09-decisions/20260929-zalo-safe-operating-model.md` (kill switch +
  ghi chú `release()` quota đã có sẵn từ trước khi tôi vào việc).

## VERIFIED

- Backend: `69 files / 500 tests` pass, `tsc --noEmit` sạch (2 lần, sau kill
  switch và sau UI + route field changes).
- Frontend: `vue-tsc --noEmit` sạch, `npm run build` pass.
- Backup set thật (định dạng cũ, trước khi thêm bucket): `backups/full/daily/20260930_104329/`
  — `db.sql.gz` (10MB), `media.tar.gz` (5.2GB), `config.tar.gz`, checksum khớp.
- Backup set thật (sau khi thêm GFS bucket): `backups/full/daily/20260930_112817/`
  — chạy lại `backup-full.sh`, retention daily đúng "giữ 2 (giới hạn 3)".
- Backup DB tự động: chạy tay `docker exec zalo-crm-backup /backup.sh` — daily/
  weekly/monthly/last đều ghi đúng, hook mới prune đúng theo giới hạn riêng
  từng bucket (kept 3/1/1/1 theo limit 7/4/6/1), hard-link dedup xác nhận qua
  link count=4 trên cùng 1 file vật lý.
- Sau khi bật RLS 92 bảng: `/health` vẫn `200`, `SELECT count(*) FROM contacts`
  vẫn ra 4002 (không đổi), log app 15 phút sau không có lỗi mới. Xác nhận
  zero-behavior-change vì `crmuser` là `superuser=true bypassrls=true` — RLS
  hiện chỉ là chuẩn bị, CHƯA enforce thật.
- `scripts/tenant-rls-preflight.sh` sau khi áp policy: `rls_enabled_tables=92/92
  policies=92`; 3 FAIL còn lại (role/guard-mode/set-config) đúng là phần cutover
  cố ý chưa làm (user quyết định để sau).
- ClamAV: `docker inspect` health=`healthy`, TCP connect `clamav:3310` từ app
  container OK, log app hết lỗi `ENOTFOUND clamav`.

## REMAINING

- **A4 chưa deploy** (quyết định user: để tối muộn/sáng sớm) — code + UI chỉ có
  trong working tree + local `node_modules`/build, container `zalo-crm-app`
  đang chạy image build cũ, chưa có route/gate/nút UI mới. Khi deploy:
  `docker compose up -d --build app` (qua `scripts/zalocrm-deploy.sh` để có
  backup guard) — restart ~10-30s, nick "Thy It" tự reconnect.
- **A3 chưa có off-host** — `BACKUP_OFFHOST_DIR` chưa cấu hình cho cả backup
  DB-only (container `backup`) lẫn `backup-full.sh`; toàn bộ backup vẫn nằm
  chung ổ đĩa với dữ liệu gốc. Cần 1 đích lưu trữ ngoài máy (NAS/S3/rclone).
- **A3 chưa restore-rehearsal nhánh media/config** — chỉ nhánh DB đã test
  (bởi Codex, trước phiên này, dùng `scripts/restore-postgres-test.sh`).
- **A2 cutover** — quyết định user: ĐỂ SAU (không có timeline), chỉ làm nếu có
  kế hoạch multi-org. Không phải việc "quên làm", là việc cố ý hoãn vô thời hạn.

## KNOWN ISSUES

- Nick "Ms Thảo - Phúc Thịnh Solar" (`205bd1ca-5514-494c-ac8b-ff57ac7648f9`) vẫn
  fail reconnect mỗi 5 phút (`session_expired: ZcaApiError Đăng nhập thất bại`)
  — cần quét QR lại thủ công. User xác nhận đây là nick nhân viên, không cần xử
  lý gấp.
- Nút "Đồng bộ" lịch sử tin nhắn (`zalo-sync-routes.ts` → `backfillAccountHistory`)
  không lấy lại được tin nhắn cũ đã mất trong lúc nick offline — giả thuyết có
  bằng chứng: cơ chế `old_messages` (WS cmd 510/511) của Zalo chỉ trả tin CHƯA
  từng giao cho bất kỳ thiết bị nào; nếu điện thoại thật đã nhận tin đó, CRM
  không lấy lại được nữa. Không phải bug, là giới hạn API không chính thức
  (`zca-js`). Tin nhắn MỚI sau khi reconnect vẫn về real-time bình thường
  (verified bằng test "Hi" thật, landing đúng lúc).
- DB hiện chỉ có đúng 1 role kết nối (`crmuser`, superuser). Nếu sau này có
  role khác connect trực tiếp (BI tool, script debug), RLS sẽ có tác dụng thật
  ngay — cần nhớ khi debug bằng psql role khác.
- Backup DB và backup media trong `backup-full.sh` không đồng bộ thời điểm
  (media tar chạy sau DB dump ~4 phút) — restore từ 1 set có thể lệch nhẹ dữ
  liệu giữa 2 mốc.

## RELEVANT FILES

Backend:
- `backend/prisma/schema.prisma` (+`sendingPausedAt/Reason/ById` trên `ZaloAccount`)
- `backend/prisma/migrations/20260930103800_zalo_account_sending_pause/`
- `backend/src/modules/zalo/zalo-kill-switch.ts`, `zalo-kill-switch-routes.ts`
- `backend/src/shared/zalo-operations.ts` (gate `SENDING_PAUSED`)
- `backend/src/app.ts` (đăng ký `zaloKillSwitchRoutes`)
- `backend/src/modules/zalo/zalo-routes.ts` (`GET /zalo-accounts` +
  `sendingPausedAt/Reason`, `canPauseSending`)
- `backend/src/modules/zalo/zalo-dashboard-routes.ts` (`GET .../enriched` — cùng field)
- `backend/tests/zalo-kill-switch.test.ts`
- `backend/prisma/rls/tenant-rls.sql` (đã apply vào DB, không đổi file)

Frontend:
- `frontend/src/composables/use-zalo-accounts.ts` (+`pauseSending/resumeSending`,
  field `sendingPausedAt/Reason/canPauseSending` trên `ZaloAccount`)
- `frontend/src/components/zalo-accounts/NickGridCards.vue` (nút "Tạm dừng
  gửi"/"Mở lại", badge `.ngc-paused`)
- `frontend/src/views/ZaloAccountsView.vue` (`onCardPauseSending/onCardResumeSending`,
  dùng `confirmWithReason`)
- **Chưa làm ở tab Nâng cao (`AccountsTable.vue`)** — chỉ tab Đơn giản
  (`NickGridCards`) có nút kill switch; nếu cần cả 2 tab thì phải thêm riêng.

Scripts:
- `scripts/backup-full.sh` (viết lại — thêm GFS bucket daily/weekly/monthly)
- `scripts/prune-backups.sh` (viết lại — retention riêng từng bucket thay vì gộp 1 số duy nhất)
- `scripts/zalocrm-deploy.sh` (`backup` thêm vào `CORE_SERVICES`)
- `docker-compose.yml` (service `backup`: env `BACKUP_KEEP_DAILY/WEEKLY/MONTHLY/LAST`)
- `scripts/tenant-rls-preflight.sh`, `scripts/prepare-tenant-app-role.sh` (có sẵn từ Codex, chưa dùng `--apply`)

Host:
- Crontab user `admin01`: `30 2 * * * cd .../zalo-crm-solar && bash scripts/backup-full.sh >> backups/logs/backup-full-cron.log 2>&1`

Docs:
- `docs/10-audits/production-readiness.md` (3 mục P1 cập nhật)
- `docs/09-decisions/20260929-zalo-safe-operating-model.md` (thêm ghi chú kill switch)

Backup thật đã tạo:
- `backups/manual/backup-zalocrm-pre-killswitch-migration-2026-09-30-1035.sql.gz`
- `backups/full/daily/20260930_104329/`, `backups/full/daily/20260930_112817/`
- `backups/daily|weekly|monthly|last/zalocrm-*.sql.gz` (container `backup`, chạy tay 1 lần 2026-09-30)

## NEXT

1. **Tối muộn/sáng sớm hôm nay hoặc mai:** deploy A4 — `docker compose up -d
   --build app` (hoặc qua `zalocrm-deploy.sh`). Sau đó verify: `/health` 200,
   nick "Thy It" reconnect, thử `POST .../pause-sending` một lần xem
   `SENDING_PAUSED` chặn đúng.
2. Cân nhắc cấu hình `BACKUP_OFFHOST_DIR` (cho cả `backup-full.sh` và tính
   thêm cho container `backup` DB-only) — hiện chưa có nơi lưu ngoài máy.
3. Restore rehearsal cho nhánh media/config (chưa test, chỉ DB đã test).
4. Nếu có kế hoạch multi-org trong tương lai: quay lại A2 cutover theo đúng
   quy trình staging + negative suite đã ghi trong REMAINING.
