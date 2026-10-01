-- ============================================================================
-- tenant-rls.sql — Postgres Row-Level Security for org-scoped tables.
--
-- The policy is deliberately generated at APPLY time from the target database,
-- instead of keeping a hand-maintained table list. This prevents a staging
-- rollout from failing when migrations add/remove an org_id table.
--
-- Rollout remains opt-in:
--   1. Use a migration/owner role to apply this file.
--   2. Use a runtime role that is NOSUPERUSER and NOBYPASSRLS.
--   3. Set app.current_org (or app.bypass_rls for explicit system work) in a
--      transaction before enabling RLS_SET_CONFIG/TENANT_GUARD_MODE.
-- ============================================================================

DO $$
DECLARE
  relation_row record;
BEGIN
  FOR relation_row IN
    SELECT c.relname AS table_name
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns AS col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'org_id'
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', relation_row.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', relation_row.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', relation_row.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
       USING (%I = current_setting(''app.current_org'', true)
              OR current_setting(''app.bypass_rls'', true) = ''on'')
       WITH CHECK (%I = current_setting(''app.current_org'', true)
                   OR current_setting(''app.bypass_rls'', true) = ''on'')',
      relation_row.table_name,
      'org_id',
      'org_id'
    );
  END LOOP;
END
$$;
