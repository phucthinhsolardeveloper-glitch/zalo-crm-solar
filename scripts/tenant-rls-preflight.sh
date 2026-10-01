#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Read-only gate for the tenant guard/RLS rollout.
# It intentionally does not ALTER ROLE, enable RLS, or change application flags.
# Run from the repository root before staging/production rollout:
#   bash scripts/tenant-rls-preflight.sh
set -euo pipefail

cd "$(dirname "$0")/.."

env_val() {
  [ -f .env ] || return 0
  grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true
}

db_user="$(env_val DB_USER)"; db_user="${db_user:-crmuser}"
db_name="$(env_val DB_NAME)"; db_name="${db_name:-zalocrm}"
guard_mode="$(env_val TENANT_GUARD_MODE)"; guard_mode="${guard_mode:-off}"
rls_set_config="$(env_val RLS_SET_CONFIG)"; rls_set_config="${rls_set_config:-false}"

expected_tables="$(docker compose exec -T db psql -U "$db_user" -d "$db_name" -Atc \
  "SELECT count(*) FROM pg_catalog.pg_class AS c JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND EXISTS (SELECT 1 FROM information_schema.columns AS col WHERE col.table_schema='public' AND col.table_name=c.relname AND col.column_name='org_id');")"
role_row="$(docker compose exec -T db psql -U "$db_user" -d "$db_name" -Atc \
  "SELECT current_user || '|' || rolsuper || '|' || rolbypassrls FROM pg_roles WHERE rolname=current_user;")"
rls_enabled="$(docker compose exec -T db psql -U "$db_user" -d "$db_name" -Atc \
  "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relrowsecurity;")"
policy_count="$(docker compose exec -T db psql -U "$db_user" -d "$db_name" -Atc \
  "SELECT count(*) FROM pg_policies WHERE schemaname='public';")"

IFS='|' read -r current_user is_superuser bypass_rls <<< "$role_row"
printf '%s\n' '=== ZCRM tenant/RLS preflight (read-only) ==='
printf 'db_role=%s superuser=%s bypassrls=%s\n' "${current_user:-unknown}" "${is_superuser:-unknown}" "${bypass_rls:-unknown}"
printf 'tenant_guard_mode=%s rls_set_config=%s\n' "$guard_mode" "$rls_set_config"
printf 'rls_enabled_tables=%s/%s policies=%s\n' "$rls_enabled" "$expected_tables" "$policy_count"

fail=0
if [ "$is_superuser" != "f" ] || [ "$bypass_rls" != "f" ]; then
  echo 'FAIL: runtime DB role must be NOSUPERUSER and NOBYPASSRLS.'
  fail=1
fi
if [ "$guard_mode" != "warn" ] && [ "$guard_mode" != "enforce" ]; then
  echo 'FAIL: TENANT_GUARD_MODE must be warn or enforce for the rollout gate.'
  fail=1
fi
if [ "$rls_set_config" != "true" ]; then
  echo 'FAIL: RLS_SET_CONFIG must be true before applying tenant policies.'
  fail=1
fi
if [ "$rls_enabled" != "$expected_tables" ] || [ "$policy_count" -lt "$expected_tables" ]; then
  echo 'FAIL: tenant-rls.sql is only partially applied.'
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo 'RESULT: NOT READY — no changes were made.'
  exit 1
fi
echo 'RESULT: READY FOR RLS STAGING GATE — continue with negative cross-org tests.'
