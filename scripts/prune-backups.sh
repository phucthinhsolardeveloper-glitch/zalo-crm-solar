#!/usr/bin/env bash
# Keep only the newest N physical database snapshots.
# postgres-backup-local normally creates hard links in daily/weekly/monthly/last,
# but copies between Windows and WSL can expand them into separate files. Count
# snapshots by SHA-256 so both representations follow the same retention rule.
set -euo pipefail

# Docker's hook runner calls every hook for error, pre-backup and post-backup.
# Automatic pruning is allowed only after a successful backup; direct calls
# from the manual scripts have no event argument and should run normally.
if (( $# > 0 )) && [[ "$1" != "post-backup" ]]; then
  exit 0
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-2}"

if ! [[ "$BACKUP_KEEP_COUNT" =~ ^[1-9][0-9]*$ ]]; then
  echo "[ERROR] BACKUP_KEEP_COUNT must be a positive integer" >&2
  exit 1
fi

[ -d "$BACKUP_DIR" ] || exit 0

mapfile -d '' entries < <(
  find "$BACKUP_DIR" -type f \( -name '*.sql' -o -name '*.sql.gz' \) \
    -printf '%T@\t%p\0' | sort -z -t $'\t' -k1,1nr
)

declare -A kept=()
declare -A pruned=()
declare -A canonical=()
kept_count=0

for entry in "${entries[@]}"; do
  path="${entry#*$'\t'}"
  [ -f "$path" ] || continue
  snapshot_hash="$(sha256sum "$path" | cut -d ' ' -f 1)"

  if [[ -n "${kept[$snapshot_hash]+x}" ]]; then
    # Collapse copied duplicates back to hard links without changing the paths
    # expected by postgres-backup-local.
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

  if (( kept_count < BACKUP_KEEP_COUNT )); then
    kept["$snapshot_hash"]=1
    canonical["$snapshot_hash"]="$path"
    ((kept_count += 1))
    continue
  fi

  echo "$path"
  rm -f -- "$path"
  pruned["$snapshot_hash"]=1
done

# Remove dangling latest pointers left after pruning an old snapshot.
find "$BACKUP_DIR" -xtype l -name '*-latest.sql*' -print -delete

echo "[INFO] Backup retention: kept $kept_count newest snapshot(s) in $BACKUP_DIR"
