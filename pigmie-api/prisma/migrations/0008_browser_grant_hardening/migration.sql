BEGIN;

-- Business tables are accessible through the protected application API.
-- REVOKE ALL also removes non-CRUD privileges, which the historical baseline
-- reconciliation did not remove (including PostgreSQL 17 MAINTAIN).
REVOKE ALL ON TABLE public.organizations, public.branches, public.staff,
  public.customers, public.loan_products, public.loans, public.loan_schedule,
  public.collections, public.cash_deposits, public.documents,
  public.notifications, public.audit_logs, public.push_subscriptions,
  public.approval_requests, public.loan_amendments
  FROM PUBLIC, anon, authenticated;

-- Only the verified application migration creator and application schema.
-- Provider-managed supabase_admin defaults and Auth/Storage are unchanged.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

COMMIT;
