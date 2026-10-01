#!/bin/bash
# Restore test script for zalo-crm-solar PostgreSQL database
# Usage: ./restore-postgres-test.sh <backup_file.sql.gz>

set -e

BACKUP_FILE="${1}"
DB_CONTAINER="zalo-crm-db"
DB_NAME="${DB_NAME:-zalocrm}"
DB_USER="${DB_USER:-crmuser}"
TEST_DB="${DB_NAME}_restore_test_$(date +%s)"
KEEP_TEST_DB="${KEEP_TEST_DB:-0}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file.sql.gz>"
  echo "Example: $0 ./backups/zalocrm_20260818_020000.sql.gz"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[ERROR] Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting restore test..."
echo "  Backup file: $BACKUP_FILE"
echo "  Test DB: $TEST_DB"
echo ""

cleanup() {
  if [ "$KEEP_TEST_DB" = "1" ]; then
    echo "[INFO] Keeping isolated test database: $TEST_DB"
    return
  fi
  echo "[CLEANUP] Dropping isolated test database: $TEST_DB..."
  docker exec "$DB_CONTAINER" dropdb -U "$DB_USER" --if-exists "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Check if container is running
if ! docker ps | grep -q "$DB_CONTAINER"; then
  echo "[ERROR] Container $DB_CONTAINER is not running"
  exit 1
fi

# Step 1: Create test database
echo "[STEP 1] Creating test database: $TEST_DB..."
docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$TEST_DB"

# Step 2: Restore backup into test database
echo "[STEP 2] Restoring backup into $TEST_DB..."
# Some dumps are produced by a newer PostgreSQL client and contain
# SET transaction_timeout, which PostgreSQL 16 does not recognize. Remove
# only that session-setting line; ON_ERROR_STOP keeps every real restore error fatal.
gunzip -c "$BACKUP_FILE" \
  | sed '/^[[:space:]]*SET transaction_timeout[[:space:]]*=/d' \
  | docker exec -i "$DB_CONTAINER" psql --set ON_ERROR_STOP=on -U "$DB_USER" -d "$TEST_DB"

# Step 3: Verify restoration
echo "[STEP 3] Verifying restoration..."
TABLE_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")

echo "  Total tables in restored DB: $TABLE_COUNT"

# Step 4: Sample data check
echo "[STEP 4] Sampling data from key tables..."
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -c \
  "SELECT COUNT(*) as contact_count FROM contacts LIMIT 1;" || echo "  (contacts table not found or empty)"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -c \
  "SELECT COUNT(*) as conversation_count FROM conversations LIMIT 1;" || echo "  (conversations table not found or empty)"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$TEST_DB" -c \
  "SELECT COUNT(*) as message_count FROM messages LIMIT 1;" || echo "  (messages table not found or empty)"

echo ""
echo "[SUCCESS] Restore test completed!"
echo ""
if [ "$KEEP_TEST_DB" = "1" ]; then
  echo "To inspect the isolated test database:"
  echo "  docker exec -it $DB_CONTAINER psql -U $DB_USER -d $TEST_DB"
else
  echo "The isolated test database will be removed automatically."
fi
