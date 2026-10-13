BEGIN;

-- Preserve unknown historical combined payments; never infer a split.
ALTER TABLE public.loan_schedule
  ADD COLUMN paid_principal NUMERIC(12,2),
  ADD COLUMN paid_interest NUMERIC(12,2),
  ADD COLUMN paid_fees NUMERIC(12,2);
ALTER TABLE public.loan_schedule ADD CONSTRAINT loan_schedule_paid_components CHECK (
  num_nonnulls(paid_principal,paid_interest,paid_fees)=0 OR (
    num_nonnulls(paid_principal,paid_interest,paid_fees)=3 AND
    paid_principal NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND
    paid_interest NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND
    paid_fees NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND
    paid_amount NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND
    principal_component NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND
    interest_component NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND
    due_amount NOT IN ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) AND
    paid_principal>=0 AND paid_interest>=0 AND paid_fees>=0 AND
    paid_principal<=principal_component AND paid_interest<=interest_component AND
    paid_fees<=due_amount-principal_component-interest_component AND
    paid_principal+paid_interest+paid_fees=paid_amount
  )
);

-- Once a split is recorded, a later write cannot erase it into historical unknown.
CREATE FUNCTION public.preserve_paid_components() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF OLD.paid_principal IS NOT NULL AND
     num_nonnulls(NEW.paid_principal,NEW.paid_interest,NEW.paid_fees) <> 3 THEN
    RAISE EXCEPTION 'Recorded paid components cannot become unknown' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.preserve_paid_components() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preserve_paid_components BEFORE UPDATE ON public.loan_schedule
FOR EACH ROW EXECUTE FUNCTION public.preserve_paid_components();

COMMIT;
