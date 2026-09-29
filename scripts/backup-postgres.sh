#!/bin/bash
# Backup script for zalo-crm-solar PostgreSQL database
# Run daily via cron: 0 2 * * * /path/to/backup-postgres-zalo.sh

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_COUNT="${BACKUP_KEEP_COUNT:-2}"
DB_CONTAINER="zalo-crm-db"
DB_NAME="${DB_NAME:-zalocrm}"
DB_USER="${DB_USER:-crmuser}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/zalocrm_${TIMESTAMP}.sql.gz"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting PostgreSQL backup (zalo-crm-solar)..."

# Check if container is running
if ! docker ps | grep -q "$DB_CONTAINER"; then
  echo "[ERROR] Container $DB_CONTAINER is not running"
  exit 1
fi

# Perform backup
docker exec "$DB_CONTAINER" pg_dump \
  -U "$DB_USER" \
  --format=plain \
  --no-password \
  "$DB_NAME" | gzip > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[SUCCESS] Backup saved to: $BACKUP_FILE (Size: $FILE_SIZE)"
else
  echo "[ERROR] Backup failed"
  exit 1
fi

# Cleanup old backups only after a successful, non-empty dump.
BACKUP_DIR="$BACKUP_DIR" BACKUP_KEEP_COUNT="$BACKUP_KEEP_COUNT" \
  "$SCRIPT_DIR/prune-backups.sh"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup complete!"
