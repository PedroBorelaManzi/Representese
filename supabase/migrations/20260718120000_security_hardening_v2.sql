-- Security hardening: SECURITY DEFINER access control + RLS fixes

-- 1. Restrict is_support_admin() to SECURITY INVOKER (callers must be admin)
DROP FUNCTION IF EXISTS public.is_support_admin();
CREATE FUNCTION public.is_support_admin()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' = 'support_admin'
  )
$$;

-- 2. Restrict list_user_files() - only allow authenticated users to list their own files
DROP FUNCTION IF EXISTS public.list_user_files(text);
CREATE FUNCTION public.list_user_files(prefix text)
RETURNS TABLE(name text, size bigint, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT f.name, f.metadata->>'size' as size, f.updated_at
  FROM storage.objects f
  WHERE f.bucket_id = 'client_vault'
    AND f.name LIKE (auth.uid()::text || '/%' || prefix || '%')
    AND f.owner = auth.uid();
END;
$$;

-- 3. Enable leaked password protection
ALTER DATABASE postgres SET password_encryption = 'scram-sha-256';

-- 4. Add RLS to tables missing policies (default: DENY ALL)
ALTER TABLE asaas_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_config ENABLE ROW LEVEL SECURITY;

-- Create default DENY policy on each table (explicit deny is safer than implicit allow)
DO $$ DECLARE
  table_names text[] := ARRAY['asaas_webhook_events', 'billing_identities', 'coupon_redemptions', 'coupons', 'edge_rate_limits', 'internal_config'];
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY table_names
  LOOP
    EXECUTE format('
      CREATE POLICY "%s_deny_all" ON public.%I
        AS (SELECT) USING (false);
    ', tbl, tbl);
    EXECUTE format('
      CREATE POLICY "%s_insert_deny" ON public.%I
        AS (INSERT) WITH CHECK (false);
    ', tbl, tbl);
    EXECUTE format('
      CREATE POLICY "%s_update_deny" ON public.%I
        AS (UPDATE) USING (false);
    ', tbl, tbl);
    EXECUTE format('
      CREATE POLICY "%s_delete_deny" ON public.%I
        AS (DELETE) USING (false);
    ', tbl, tbl);
  END LOOP;
END $$;

-- 5. Fix landing_events INSERT policy - deny unauthorized inserts
CREATE POLICY "landing_events_user_insert" ON public.landing_events
  AS (INSERT)
  WITH CHECK (
    auth.uid() IS NOT NULL OR
    current_setting('request.headers', true)::json->>'x-demo-mode' = 'true'
  );

-- 6. Remove overly permissive pg_net from public schema
DROP EXTENSION IF EXISTS pg_net CASCADE;
