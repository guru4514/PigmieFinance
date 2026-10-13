BEGIN;

-- Password and LOGIN activation belong to the guarded provisioning tool.
-- This migration intentionally contains no credentials.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pigmie_runtime') THEN
    CREATE ROLE pigmie_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    RAISE EXCEPTION 'Unexpected pre-existing runtime role; explicit reconciliation is required';
  END IF;
END;
$$;

-- Deployment preflight must first prove the old login is not serving the API.
ALTER ROLE pigmie_app NOLOGIN;
REVOKE ALL ON SCHEMA public FROM pigmie_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM pigmie_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM pigmie_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM pigmie_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM pigmie_app;

GRANT USAGE ON SCHEMA public TO pigmie_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM pigmie_runtime;

CREATE OR REPLACE FUNCTION public.request_organization_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('app.current_org_id', true), '')::uuid;
$$;
CREATE FUNCTION public.request_auth_user_id()
RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('app.current_auth_id', true), '')::uuid;
$$;
REVOKE ALL ON FUNCTION public.request_organization_id(), public.request_auth_user_id(), public.current_staff_org_id() FROM PUBLIC, anon, authenticated, pigmie_app;
GRANT EXECUTE ON FUNCTION public.request_organization_id(), public.request_auth_user_id() TO pigmie_runtime;

-- Replace every historical permissive policy on the known application tables.
-- Leaving even one broad OR-policy in place would defeat the new boundary.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename, policyname FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = ANY (ARRAY[
      'organizations','branches','staff','customers','loan_products','loans',
      'loan_schedule','collections','cash_deposits','documents','notifications',
      'audit_logs','push_subscriptions','approval_requests','loan_amendments'])
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', item.policyname, item.tablename);
  END LOOP;
  FOR item IN SELECT unnest(ARRAY[
      'organizations','branches','staff','customers','loan_products','loans',
      'loan_schedule','collections','cash_deposits','documents','notifications',
      'audit_logs','push_subscriptions','approval_requests','loan_amendments']) AS tablename
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.organizations, public.branches, public.staff,
  public.customers, public.loan_products, public.loans, public.loan_schedule,
  public.collections, public.cash_deposits, public.documents, public.notifications,
  public.audit_logs, public.push_subscriptions, public.approval_requests,
  public.loan_amendments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.organizations TO pigmie_runtime;
GRANT SELECT, INSERT, UPDATE ON public.branches, public.staff, public.customers,
  public.loan_products, public.loans, public.collections, public.cash_deposits,
  public.notifications, public.approval_requests TO pigmie_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_schedule, public.documents,
  public.push_subscriptions TO pigmie_runtime;
GRANT SELECT, INSERT ON public.audit_logs, public.loan_amendments TO pigmie_runtime;

CREATE POLICY runtime_organizations_read ON public.organizations FOR SELECT TO pigmie_runtime USING (id = public.request_organization_id());
CREATE POLICY runtime_organizations_update ON public.organizations FOR UPDATE TO pigmie_runtime USING (id = public.request_organization_id()) WITH CHECK (id = public.request_organization_id());
CREATE POLICY runtime_organizations_onboard ON public.organizations FOR INSERT TO pigmie_runtime WITH CHECK (id = public.request_organization_id() AND public.request_auth_user_id() IS NOT NULL AND current_setting('app.onboarding_mode', true) = '1');

-- Identity context adds SELECT only. It never expands tenant write permission.
CREATE POLICY runtime_staff_identity_read ON public.staff FOR SELECT TO pigmie_runtime USING (auth_user_id = public.request_auth_user_id());
CREATE POLICY runtime_customer_identity_read ON public.customers FOR SELECT TO pigmie_runtime USING (auth_user_id = public.request_auth_user_id());

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['branches','staff','customers','loan_products','loans','collections','cash_deposits','documents','notifications']
  LOOP
    EXECUTE format('CREATE POLICY runtime_tenant_read ON public.%I FOR SELECT TO pigmie_runtime USING (organization_id = public.request_organization_id())', table_name);
    EXECUTE format('CREATE POLICY runtime_tenant_insert ON public.%I FOR INSERT TO pigmie_runtime WITH CHECK (organization_id = public.request_organization_id())', table_name);
    EXECUTE format('CREATE POLICY runtime_tenant_update ON public.%I FOR UPDATE TO pigmie_runtime USING (organization_id = public.request_organization_id()) WITH CHECK (organization_id = public.request_organization_id())', table_name);
  END LOOP;
END;
$$;
CREATE POLICY runtime_documents_delete ON public.documents FOR DELETE TO pigmie_runtime USING (organization_id = public.request_organization_id());

CREATE POLICY runtime_schedule_read ON public.loan_schedule FOR SELECT TO pigmie_runtime USING (EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.organization_id = public.request_organization_id()));
CREATE POLICY runtime_schedule_insert ON public.loan_schedule FOR INSERT TO pigmie_runtime WITH CHECK (EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.organization_id = public.request_organization_id()));
CREATE POLICY runtime_schedule_update ON public.loan_schedule FOR UPDATE TO pigmie_runtime USING (EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.organization_id = public.request_organization_id())) WITH CHECK (EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.organization_id = public.request_organization_id()));
CREATE POLICY runtime_schedule_delete ON public.loan_schedule FOR DELETE TO pigmie_runtime USING (EXISTS (SELECT 1 FROM public.loans l WHERE l.id = loan_id AND l.organization_id = public.request_organization_id()));

CREATE POLICY runtime_approval_read ON public.approval_requests FOR SELECT TO pigmie_runtime USING ("organizationId" = public.request_organization_id());
CREATE POLICY runtime_approval_insert ON public.approval_requests FOR INSERT TO pigmie_runtime WITH CHECK ("organizationId" = public.request_organization_id());
CREATE POLICY runtime_approval_update ON public.approval_requests FOR UPDATE TO pigmie_runtime USING ("organizationId" = public.request_organization_id()) WITH CHECK ("organizationId" = public.request_organization_id());

CREATE POLICY runtime_audit_read ON public.audit_logs FOR SELECT TO pigmie_runtime USING (organization_id = public.request_organization_id());
CREATE POLICY runtime_audit_insert ON public.audit_logs FOR INSERT TO pigmie_runtime WITH CHECK (organization_id = public.request_organization_id());
CREATE POLICY runtime_amendment_read ON public.loan_amendments FOR SELECT TO pigmie_runtime USING (organization_id = public.request_organization_id());
CREATE POLICY runtime_amendment_insert ON public.loan_amendments FOR INSERT TO pigmie_runtime WITH CHECK (organization_id = public.request_organization_id());

CREATE POLICY runtime_push_access ON public.push_subscriptions FOR ALL TO pigmie_runtime
USING (auth_user_id = public.request_auth_user_id() OR EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_user_id = push_subscriptions.auth_user_id AND s.organization_id = public.request_organization_id()) OR EXISTS (SELECT 1 FROM public.customers c WHERE c.auth_user_id = push_subscriptions.auth_user_id AND c.organization_id = public.request_organization_id()))
WITH CHECK (auth_user_id = public.request_auth_user_id() OR EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_user_id = push_subscriptions.auth_user_id AND s.organization_id = public.request_organization_id()) OR EXISTS (SELECT 1 FROM public.customers c WHERE c.auth_user_id = push_subscriptions.auth_user_id AND c.organization_id = public.request_organization_id()));

-- No default table/sequence grant: every future application table needs review.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM pigmie_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM pigmie_runtime;

-- Fixed-shape bootstrap checks. No Auth schema/table privilege is granted to
-- runtime. The backend passes only identities/session IDs from verified JWTs.
CREATE FUNCTION public.runtime_provider_session(p_auth_user_id uuid, p_session_id uuid)
RETURNS TABLE(active boolean, "hasVerifiedFactor" boolean, "provisioningIdentity" boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id
    WHERE s.id = p_session_id AND s.user_id = p_auth_user_id
      AND (s.not_after IS NULL OR s.not_after > now())
      AND (u.banned_until IS NULL OR u.banned_until <= now())
  ), EXISTS (
    SELECT 1 FROM auth.mfa_factors f
    WHERE f.user_id = p_auth_user_id AND f.status = 'verified'
  ), EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = p_auth_user_id
      AND u.raw_app_meta_data ? 'pigmie_provisioning_attempt'
  )
  WHERE p_auth_user_id IS NOT NULL
    AND p_auth_user_id = public.request_auth_user_id();
$$;

CREATE FUNCTION public.runtime_onboarding_identity(p_auth_user_id uuid)
RETURNS TABLE(email text, confirmed boolean, banned boolean, provisioning boolean, linked boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_auth_user_id IS NULL OR p_auth_user_id IS DISTINCT FROM public.request_auth_user_id()
     OR current_setting('app.onboarding_mode', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Onboarding identity context is invalid' USING ERRCODE = '42501';
  END IF;
  -- The row lock serializes competing first-use onboarding transactions.
  RETURN QUERY SELECT u.email::text, u.email_confirmed_at IS NOT NULL,
    (u.banned_until IS NOT NULL AND u.banned_until > now()),
    (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'pigmie_provisioning_attempt'),
    (EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_user_id = u.id)
      OR EXISTS (SELECT 1 FROM public.customers c WHERE c.auth_user_id = u.id))
    FROM auth.users u WHERE u.id = p_auth_user_id FOR UPDATE OF u;
END;
$$;

CREATE FUNCTION public.runtime_active_organization_ids()
RETURNS TABLE(id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT o.id FROM public.organizations o WHERE o.is_active ORDER BY o.id;
$$;

CREATE FUNCTION public.runtime_provisioning_candidates(p_candidate_uuid uuid DEFAULT NULL, p_attempt_uuid uuid DEFAULT NULL)
RETURNS TABLE("authUserId" uuid, "attemptId" text, "organizationId" text, "createdAt" timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF (p_candidate_uuid IS NULL) <> (p_attempt_uuid IS NULL) THEN
    RAISE EXCEPTION 'Provisioning candidate parameters must be paired' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT u.id,
    u.raw_app_meta_data->>'pigmie_provisioning_attempt',
    u.raw_app_meta_data->>'pigmie_organization_id', u.created_at
    FROM auth.users u
    WHERE u.created_at < now() - interval '15 minutes'
      AND u.raw_app_meta_data->>'pigmie_provisioning_attempt' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND u.raw_app_meta_data->>'pigmie_organization_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.auth_user_id = u.id)
      AND (p_candidate_uuid IS NULL OR (u.id = p_candidate_uuid AND u.raw_app_meta_data->>'pigmie_provisioning_attempt' = p_attempt_uuid::text))
    ORDER BY u.created_at, u.id LIMIT 100;
END;
$$;

ALTER FUNCTION public.runtime_provider_session(uuid, uuid) OWNER TO postgres;
ALTER FUNCTION public.runtime_onboarding_identity(uuid) OWNER TO postgres;
ALTER FUNCTION public.runtime_active_organization_ids() OWNER TO postgres;
ALTER FUNCTION public.runtime_provisioning_candidates(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.runtime_provider_session(uuid, uuid), public.runtime_onboarding_identity(uuid), public.runtime_active_organization_ids(), public.runtime_provisioning_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated, pigmie_app;
GRANT EXECUTE ON FUNCTION public.runtime_provider_session(uuid, uuid), public.runtime_onboarding_identity(uuid), public.runtime_active_organization_ids(), public.runtime_provisioning_candidates(uuid, uuid) TO pigmie_runtime;

COMMIT;
