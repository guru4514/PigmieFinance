-- Match the existing Prisma model without changing any MFA enabled flags.
-- Legacy raw-query installations may have created a bytea column. Preserve
-- its ciphertext as PostgreSQL hex text, which AuthService explicitly accepts.
DO $$
DECLARE
  secret_type text;
BEGIN
  SELECT data_type INTO secret_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff'
      AND column_name = 'two_factor_secret';
  IF secret_type IS NULL THEN
    ALTER TABLE public.staff ADD COLUMN two_factor_secret text;
  ELSIF secret_type = 'bytea' THEN
    ALTER TABLE public.staff ALTER COLUMN two_factor_secret TYPE text
      USING CASE WHEN two_factor_secret IS NULL THEN NULL
        ELSE chr(92) || 'x' || encode(two_factor_secret, 'hex') END;
  ELSIF secret_type NOT IN ('text', 'character varying') THEN
    RAISE EXCEPTION 'Unsupported staff.two_factor_secret type: %. Inspect before migrating.', secret_type;
  END IF;
END;
$$;
