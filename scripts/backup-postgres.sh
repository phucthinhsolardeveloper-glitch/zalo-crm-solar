#!/bin/bash
# Backup script for zalo-crm-solar PostgreSQL database
# Run daily via cron: 0 2 * * * /path/to/backup-postgres-zalo.sh

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_CONTAINER="zalo-crm-db"
DB_NAME="${DB_NAME:-zalocrm}"
DB_USER="${DB_USER:-crmuser}"
RETENTION_DAYS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/zalocrm_${TIMESTAMP}.sql.gz"

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

# Cleanup old backups (keep last 7 days)
echo "[INFO] Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "zalocrm_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup complete!"
