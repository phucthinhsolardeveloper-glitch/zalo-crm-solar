#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Prepare a non-superuser runtime role for Postgres RLS.
# Dry-run is the default. This script never applies RLS policies or changes the
# app connection until the operator explicitly sets DB_APP_* and runs --apply.
#
# Usage:
#   bash scripts/prepare-tenant-app-role.sh
#   bash scripts/prepare-tenant-app-role.sh --apply
set -euo pipefail

cd "$(dirname "$0")/.."

env_val() {
  local from_env="${!1-}"
  if [ -n "$from_env" ]; then
    printf '%s' "$from_env" | tr -d '\r'
    return 0
  fi
  [ -f .env ] || return 0
  grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true
}

db_admin_user="$(env_val DB_USER)"; db_admin_user="${db_admin_user:-crmuser}"
db_name="$(env_val DB_NAME)"; db_name="${db_name:-zalocrm}"
app_user="$(env_val DB_APP_USER)"
app_password="$(env_val DB_APP_PASSWORD)"
apply=0
[ "${1:-}" = "--apply" ] && apply=1

if [ -z "$app_user" ] || [ -z "$app_password" ]; then
  echo 'DB_APP_USER and DB_APP_PASSWORD must be set in .env before preparing the runtime role.'
  echo 'No database changes were made.'
  exit 1
fi
case "$app_user" in
  *[!a-zA-Z0-9_]* ) echo 'DB_APP_USER may contain only letters, digits, underscore.' >&2; exit 1 ;;
esac

role_row="$(docker compose exec -T db psql -U "$db_admin_user" -d "$db_name" -Atc \
  "SELECT rolname || '|' || rolsuper || '|' || rolbypassrls || '|' || rolcanlogin FROM pg_roles WHERE rolname = '$app_user';")"

echo '=== ZCRM tenant runtime role preparation ==='
echo "admin_role=$db_admin_user app_role=$app_user database=$db_name mode=$([ "$apply" -eq 1 ] && echo APPLY || echo DRY-RUN)"
if [ -n "$role_row" ]; then
  echo "existing_role=$role_row"
else
  echo 'existing_role=missing'
fi

if [ "$apply" -ne 1 ]; then
  echo 'DRY-RUN: would create/alter role to LOGIN, NOSUPERUSER, NOBYPASSRLS and grant runtime CRUD/default privileges.'
  echo 'DRY-RUN: no database changes were made.'
  exit 0
fi

docker compose exec -T db psql -v ON_ERROR_STOP=1 \
  -v app_user="$app_user" -v app_password="$app_password" -v db_name="$db_name" \
  -U "$db_admin_user" -d "$db_name" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')\gexec
ALTER ROLE :"app_user" LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app_user";
SQL

echo "Role $app_user prepared as NOSUPERUSER/NOBYPASSRLS."
echo 'Next: set TENANT_GUARD_MODE=warn and RLS_SET_CONFIG=true only in staging after applying the full policy file and running negative cross-org tests.'
