#!/bin/bash
# Full disaster-recovery backup for zalo-crm-solar: database + media volume +
# app config, each checksummed, plus an optional off-host copy.
#
# Extends scripts/backup-postgres.sh (DB-only) per production-readiness.md
# P1 "DR mới xác minh phần PostgreSQL local" — that item only covered the DB;
# this covers the remaining media/config/off-host gap.
#
# GFS retention like the DB-only `backup` container (scripts/prune-backups.sh):
# every run writes a daily/ set; on the designated weekly day and the 1st of
# the month, the SAME set is also hard-linked into weekly/ and monthly/ (zero
# extra disk cost for identical bytes — see cp -al below). Each bucket keeps
# its own newest-N sets independently.
#
# Usage: ./scripts/backup-full.sh
# Env:
#   BACKUP_DIR              (default ./backups/full)
#   BACKUP_KEEP_DAILY        (default 3)  — media sets are big; keep this lean
#   BACKUP_KEEP_WEEKLY       (default 2)
#   BACKUP_KEEP_MONTHLY      (default 2)
#   BACKUP_WEEKLY_ISO_DOW    (default 7 = Sunday) — ISO day-of-week that also becomes the weekly set
#   BACKUP_MONTHLY_DOM       (default 1) — day-of-month that also becomes the monthly set
#   BACKUP_OFFHOST_DIR       optional — if set and mounted/reachable, the whole
#                            batch is also copied there (e.g. a mounted NAS/S3
#                            gateway path). Left unset here on purpose: this repo
#                            has no known off-host target configured yet.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups/full}"
BACKUP_KEEP_DAILY="${BACKUP_KEEP_DAILY:-3}"
BACKUP_KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-2}"
BACKUP_KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-2}"
BACKUP_WEEKLY_ISO_DOW="${BACKUP_WEEKLY_ISO_DOW:-7}"
BACKUP_MONTHLY_DOM="${BACKUP_MONTHLY_DOM:-1}"
DB_CONTAINER="zalo-crm-db"
APP_CONTAINER="zalo-crm-app"
DB_NAME="${DB_NAME:-zalocrm}"
DB_USER="${DB_USER:-crmuser}"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log()  { echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*"; }
die()  { echo "[ERROR] $*" >&2; exit 1; }

docker inspect "$DB_CONTAINER" >/dev/null 2>&1 || die "Container $DB_CONTAINER không chạy."
docker inspect "$APP_CONTAINER" >/dev/null 2>&1 || die "Container $APP_CONTAINER không chạy."

DAILY_DIR="$BACKUP_DIR/daily"
SET_DIR="$DAILY_DIR/$TIMESTAMP"
mkdir -p "$SET_DIR"
log "Backup set → $SET_DIR"

# ── 1. Database ──────────────────────────────────────────────────────────────
DB_FILE="$SET_DIR/db.sql.gz"
log "Dump PostgreSQL ($DB_NAME) …"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" --format=plain --no-password "$DB_NAME" \
  | gzip > "$DB_FILE"
[ -s "$DB_FILE" ] || die "DB dump rỗng — dừng, không tạo backup set không đầy đủ."

# ── 2. Media (file_storage volume) ───────────────────────────────────────────
# Resolve the volume name from the running container's mount so this script
# doesn't hardcode a docker-compose project-name prefix.
MEDIA_VOLUME="$(docker inspect "$APP_CONTAINER" \
  --format '{{range .Mounts}}{{if eq .Destination "/var/lib/zalo-crm/files"}}{{.Name}}{{end}}{{end}}')"
[ -n "$MEDIA_VOLUME" ] || die "Không tìm thấy volume file_storage gắn ở $APP_CONTAINER."

MEDIA_FILE="$SET_DIR/media.tar.gz"
log "Tar volume media ($MEDIA_VOLUME) …"
docker run --rm \
  -v "$MEDIA_VOLUME:/data:ro" \
  -v "$SET_DIR:/backup" \
  alpine:3 \
  tar czf "/backup/$(basename "$MEDIA_FILE")" -C /data . \
  || die "Tar media thất bại."
[ -s "$MEDIA_FILE" ] || die "media.tar.gz rỗng."

# ── 3. Config (.env files) — no secret ever printed to stdout/log ───────────
CONFIG_FILE="$SET_DIR/config.tar.gz"
log "Đóng gói config (.env, docker-compose.yml) …"
tar czf "$CONFIG_FILE" -C "$REPO_ROOT" \
  --ignore-failed-read \
  .env backend/.env docker-compose.yml 2>/dev/null || true
[ -s "$CONFIG_FILE" ] || die "config.tar.gz rỗng — kiểm tra .env có tồn tại không."
chmod 600 "$CONFIG_FILE"

# ── 4. Checksum manifest ─────────────────────────────────────────────────────
( cd "$SET_DIR" && sha256sum db.sql.gz media.tar.gz config.tar.gz > checksums.sha256 )
log "Checksum:"
cat "$SET_DIR/checksums.sha256"

TOTAL_SIZE="$(du -sh "$SET_DIR" | cut -f1)"
log "Backup set hoàn tất: $SET_DIR (tổng $TOTAL_SIZE)"

# ── 5. GFS fan-out: hard-link the same set into weekly/monthly on their day ──
# cp -al copies the directory tree but links each file's bytes — the weekly/
# monthly copy costs disk space only for the directory entries, not the data.
iso_dow="$(date +%u)"   # 1=Mon .. 7=Sun
dom="$(date +%-d)"      # day of month, no leading zero

if [ "$iso_dow" = "$BACKUP_WEEKLY_ISO_DOW" ]; then
  mkdir -p "$BACKUP_DIR/weekly"
  cp -al "$SET_DIR" "$BACKUP_DIR/weekly/$TIMESTAMP"
  log "Set này cũng là weekly (ISO dow=$iso_dow) → hard-link vào weekly/$TIMESTAMP"
fi
if [ "$dom" = "$BACKUP_MONTHLY_DOM" ]; then
  mkdir -p "$BACKUP_DIR/monthly"
  cp -al "$SET_DIR" "$BACKUP_DIR/monthly/$TIMESTAMP"
  log "Set này cũng là monthly (ngày $dom) → hard-link vào monthly/$TIMESTAMP"
fi

# ── 6. Optional off-host copy ────────────────────────────────────────────────
if [ -n "${BACKUP_OFFHOST_DIR:-}" ]; then
  if [ -d "${BACKUP_OFFHOST_DIR}" ]; then
    log "Sao chép off-host → $BACKUP_OFFHOST_DIR …"
    cp -r "$SET_DIR" "$BACKUP_OFFHOST_DIR/"
    log "Off-host copy xong."
  else
    die "BACKUP_OFFHOST_DIR=$BACKUP_OFFHOST_DIR không tồn tại/không mount — DỪNG (không coi backup là an toàn nếu off-host thất bại âm thầm)."
  fi
else
  log "[NEEDS VERIFICATION] BACKUP_OFFHOST_DIR chưa cấu hình — backup set này CHỈ nằm trên cùng host với dữ liệu gốc, chưa đạt DR thật (mất máy chủ = mất cả data lẫn backup)."
fi

# ── 7. Retention: keep newest N SETS (directories) per bucket, independently ─
prune_set_bucket() {
  local bucket_dir="$1" keep_n="$2"
  [ -d "$bucket_dir" ] || return 0
  mapfile -t old_sets < <(find "$bucket_dir" -mindepth 1 -maxdepth 1 -type d | sort -r | tail -n +$((keep_n + 1)))
  for d in "${old_sets[@]:-}"; do
    [ -n "$d" ] || continue
    log "Xoá backup set cũ ($bucket_dir): $d"
    rm -rf -- "$d"
  done
  local remaining; remaining="$(find "$bucket_dir" -mindepth 1 -maxdepth 1 -type d | wc -l)"
  log "[INFO] $bucket_dir: giữ $remaining set (giới hạn $keep_n)"
}

prune_set_bucket "$DAILY_DIR" "$BACKUP_KEEP_DAILY"
prune_set_bucket "$BACKUP_DIR/weekly" "$BACKUP_KEEP_WEEKLY"
prune_set_bucket "$BACKUP_DIR/monthly" "$BACKUP_KEEP_MONTHLY"

log "Xong. Nhớ chạy restore rehearsal định kỳ — backup chưa restore-test thì chưa coi là hoàn chỉnh."
