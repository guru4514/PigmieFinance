BEGIN;
CREATE TABLE public.loan_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  actor_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  version INTEGER NOT NULL CHECK (version > 0),
  operation TEXT NOT NULL CHECK (operation = 'restructure'),
  reason TEXT,
  before_evidence JSONB NOT NULL CHECK (COALESCE(jsonb_typeof(before_evidence) = 'object' AND before_evidence->>'evidenceVersion' = '1', false)),
  after_evidence JSONB NOT NULL CHECK (COALESCE(jsonb_typeof(after_evidence) = 'object' AND after_evidence->>'evidenceVersion' = '1' AND after_evidence->>'borrowerAcceptance' = 'not_recorded', false)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX loan_amendments_loan_id_version_key ON public.loan_amendments(loan_id, version);
CREATE INDEX idx_loan_amendments_org ON public.loan_amendments(organization_id);
ALTER TABLE public.loan_amendments ENABLE ROW LEVEL SECURITY;
CREATE POLICY loan_amendments_read ON public.loan_amendments FOR SELECT USING (organization_id = public.request_organization_id());
CREATE POLICY loan_amendments_insert ON public.loan_amendments FOR INSERT WITH CHECK (organization_id = public.request_organization_id());
REVOKE ALL ON public.loan_amendments FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pigmie_app') THEN
   REVOKE ALL ON public.loan_amendments FROM pigmie_app;
   GRANT SELECT, INSERT ON public.loan_amendments TO pigmie_app;
 END IF;
END $$;

CREATE FUNCTION public.protect_loan_amendment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE next_version INTEGER;
BEGIN
 IF TG_OP = 'DELETE' THEN
   -- Parent cascades allow scoped fixture/organization cleanup; standalone erasure is denied.
   IF EXISTS (SELECT 1 FROM public.loans WHERE id = OLD.loan_id)
      AND EXISTS (SELECT 1 FROM public.organizations WHERE id = OLD.organization_id) THEN
     RAISE EXCEPTION 'Loan amendment evidence cannot be deleted' USING ERRCODE = '23514';
   END IF;
   RETURN OLD;
 END IF;
 IF TG_OP = 'UPDATE' THEN
   RAISE EXCEPTION 'Loan amendment evidence is immutable' USING ERRCODE = '23514';
 END IF;
 IF NEW.organization_id IS DISTINCT FROM public.request_organization_id()
    OR NOT EXISTS (SELECT 1 FROM public.loans WHERE id = NEW.loan_id AND organization_id = NEW.organization_id)
    OR NOT EXISTS (
      SELECT 1 FROM public.staff s JOIN public.loans l ON l.id = NEW.loan_id
      JOIN public.customers c ON c.id = l.customer_id AND c.organization_id = NEW.organization_id
      WHERE s.id = NEW.actor_staff_id AND s.organization_id = NEW.organization_id AND s.is_active
      AND (s.role = 'org_admin' OR (s.role = 'branch_manager' AND s.branch_id IS NOT NULL AND s.branch_id = c.branch_id))
    ) THEN
   RAISE EXCEPTION 'Loan amendment scope is invalid' USING ERRCODE = '23514';
 END IF;
 PERFORM 1 FROM public.loans WHERE id = NEW.loan_id AND organization_id = NEW.organization_id FOR UPDATE;
 SELECT COALESCE(MAX(version), 0) + 1 INTO next_version FROM public.loan_amendments WHERE loan_id = NEW.loan_id;
 IF NEW.version <> next_version THEN
   RAISE EXCEPTION 'Loan amendment version is not consecutive' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_loan_amendment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_loan_amendment BEFORE INSERT OR UPDATE OR DELETE ON public.loan_amendments FOR EACH ROW EXECUTE FUNCTION public.protect_loan_amendment();
COMMIT;
