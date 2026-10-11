BEGIN;

-- NULL preserves unknown historical terms and allocations without guessing.
ALTER TABLE public.loans ADD COLUMN financial_terms JSONB;
ALTER TABLE public.collections ADD COLUMN allocation_details JSONB;
ALTER TABLE public.loans ADD CONSTRAINT loans_financial_terms_object CHECK
  (financial_terms IS NULL OR COALESCE(jsonb_typeof(financial_terms) = 'object' AND financial_terms->>'version' = '1', false));
ALTER TABLE public.collections ADD CONSTRAINT collections_allocation_details_object CHECK
  (allocation_details IS NULL OR COALESCE(jsonb_typeof(allocation_details) = 'object' AND allocation_details->>'version' = '1', false));

CREATE FUNCTION public.protect_financial_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_TABLE_NAME = 'loans' THEN
    IF NEW.financial_terms IS DISTINCT FROM OLD.financial_terms THEN
      RAISE EXCEPTION 'Loan contract evidence is immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.allocation_details IS NOT NULL AND NEW.allocation_details IS DISTINCT FROM OLD.allocation_details THEN
    RAISE EXCEPTION 'Payment allocation evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_financial_evidence() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_loan_contract BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.protect_financial_evidence();
CREATE TRIGGER protect_collection_allocation BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.protect_financial_evidence();

COMMIT;
