#!/usr/bin/env bash
# Per-bucket backup retention: daily/weekly/monthly/last each keep their own
# newest-N snapshots, independent of the others. New backup arrives → oldest
# in that bucket gets deleted once the bucket is over its limit (FIFO).
#
# postgres-backup-local writes the SAME dump into daily/ + weekly/ (Sundays) +
# monthly/ (1st of month) + last/ simultaneously; count by SHA-256 so a file
# that got copied instead of hard-linked (Windows/WSL round-trip) still counts
# once per bucket, and collapse duplicates back to hard links to avoid paying
# disk cost per bucket for the same content.
set -euo pipefail

# Docker's hook runner calls every hook for error, pre-backup and post-backup.
# Automatic pruning is allowed only after a successful backup; direct calls
# from the manual scripts have no event argument and should run normally.
if (( $# > 0 )) && [[ "$1" != "post-backup" ]]; then
  exit 0
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
BACKUP_KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
BACKUP_KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-6}"
BACKUP_KEEP_LAST="${BACKUP_KEEP_LAST:-1}"
# Fallback bucket size for any subfolder that isn't one of the 4 known names
# (keeps old callers using a flat BACKUP_DIR/ with no subfolders working).
BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-2}"

keep_count_for() {
  case "$1" in
    daily) echo "$BACKUP_KEEP_DAILY" ;;
    weekly) echo "$BACKUP_KEEP_WEEKLY" ;;
    monthly) echo "$BACKUP_KEEP_MONTHLY" ;;
    last) echo "$BACKUP_KEEP_LAST" ;;
    *) echo "$BACKUP_KEEP_COUNT" ;;
  esac
}

[ -d "$BACKUP_DIR" ] || exit 0

prune_bucket() {
  local bucket_dir="$1"
  local keep_n="$2"

  if ! [[ "$keep_n" =~ ^[1-9][0-9]*$ ]]; then
    echo "[ERROR] keep count for $bucket_dir must be a positive integer (got: $keep_n)" >&2
    return 1
  fi

  mapfile -d '' entries < <(
    find "$bucket_dir" -maxdepth 1 -type f \( -name '*.sql' -o -name '*.sql.gz' \) \
      -printf '%T@\t%p\0' | sort -z -t $'\t' -k1,1nr
  )

  local -A kept=() pruned=() canonical=()
  local kept_count=0

  for entry in "${entries[@]}"; do
    local path="${entry#*$'\t'}"
    [ -f "$path" ] || continue
    local snapshot_hash; snapshot_hash="$(sha256sum "$path" | cut -d ' ' -f 1)"

    if [[ -n "${kept[$snapshot_hash]+x}" ]]; then
      if ! [ "$path" -ef "${canonical[$snapshot_hash]}" ]; then
        rm -f -- "$path"
        ln -- "${canonical[$snapshot_hash]}" "$path"
      fi
      continue
    fi
    if [[ -n "${pruned[$snapshot_hash]+x}" ]]; then
      rm -f -- "$path"
      continue
    fi

    if (( kept_count < keep_n )); then
      kept["$snapshot_hash"]=1
      canonical["$snapshot_hash"]="$path"
      ((kept_count += 1))
      continue
    fi

    echo "$path"
    rm -f -- "$path"
    pruned["$snapshot_hash"]=1
  done

  find "$bucket_dir" -maxdepth 1 -xtype l -name '*-latest.sql*' -print -delete
  echo "[INFO] $bucket_dir: kept $kept_count newest snapshot(s) (limit $keep_n)"
}

# Known GFS buckets as direct subfolders of BACKUP_DIR.
found_bucket=0
for name in daily weekly monthly last; do
  d="$BACKUP_DIR/$name"
  [ -d "$d" ] || continue
  found_bucket=1
  prune_bucket "$d" "$(keep_count_for "$name")"
done

# Back-compat: BACKUP_DIR itself holds backup files directly (no subfolders) —
# treat it as one flat bucket under BACKUP_KEEP_COUNT, same as before.
if [ "$found_bucket" -eq 0 ]; then
  prune_bucket "$BACKUP_DIR" "$BACKUP_KEEP_COUNT"
fi
