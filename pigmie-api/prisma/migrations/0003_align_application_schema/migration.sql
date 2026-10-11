-- Additive alignment with the current Prisma model. Not yet verified/applied.
-- Pre-existing untracked objects require explicit reconciliation; do not force deployment.
BEGIN;

CREATE TYPE public.kyc_status AS ENUM ('not_submitted', 'submitted', 'verified', 'rejected');
CREATE TYPE public."ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public."ApprovalActionType" AS ENUM ('delete_customer', 'reverse_collection', 'close_loan', 'write_off_loan', 'restructure_loan');

ALTER TABLE public.customers ADD COLUMN kyc_status public.kyc_status NOT NULL DEFAULT 'not_submitted';

CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions(endpoint);
CREATE INDEX push_subscriptions_auth_user_id_idx ON public.push_subscriptions(auth_user_id);

CREATE TABLE public.approval_requests (
  id UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "actionType" public."ApprovalActionType" NOT NULL,
  status public."ApprovalStatus" NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL,
  reason TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "submittedById" UUID NOT NULL,
  "reviewedById" UUID,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT approval_requests_pkey PRIMARY KEY (id),
  CONSTRAINT "approval_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "approval_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES public.staff(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "approval_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES public.staff(id) ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- Business data is accessed through the API, which enforces MFA/roles/locks.
-- The historical policies do not enforce those controls on direct Data API writes.
REVOKE ALL ON TABLE public.organizations, public.branches, public.staff,
  public.customers, public.loan_products, public.loans, public.loan_schedule,
  public.collections, public.cash_deposits, public.documents,
  public.notifications, public.audit_logs, public.push_subscriptions,
  public.approval_requests FROM PUBLIC, anon, authenticated;

COMMIT;
