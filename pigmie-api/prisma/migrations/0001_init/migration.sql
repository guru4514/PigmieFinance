-- Enum Types
create type user_role as enum ('org_admin', 'branch_manager', 'agent', 'accountant');
create type id_proof_type as enum ('aadhaar', 'pan', 'voter_id', 'passport', 'driving_license', 'other');
create type interest_type as enum ('flat', 'reducing_balance');
create type collection_frequency as enum ('daily', 'weekly', 'biweekly', 'monthly');
create type late_fee_type as enum ('flat', 'percentage');
create type loan_status as enum ('pending_approval', 'approved', 'rejected', 'active', 'closed', 'defaulted', 'written_off');
create type schedule_status as enum ('pending', 'partially_paid', 'paid', 'overdue', 'waived');
create type collection_method as enum ('cash', 'cheque', 'other');
create type collection_status as enum ('recorded', 'verified', 'disputed', 'reversed');
create type deposit_status as enum ('pending', 'verified', 'discrepancy');
create type document_related_type as enum ('customer', 'loan', 'collection');
create type notification_recipient_type as enum ('staff', 'customer');

-- Tables
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  operator_type text not null default 'organization' check (operator_type in ('individual', 'organization')),
  currency char(3) not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  contact_email text,
  contact_phone text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_branches_org on branches(organization_id);

create table staff (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  auth_user_id uuid not null unique,
  employee_code text,
  full_name text not null,
  email text not null,
  phone text,
  role user_role not null,
  is_active boolean not null default true,
  two_factor_enabled boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, employee_code)
);
create index idx_staff_org on staff(organization_id);
create index idx_staff_auth_user on staff(auth_user_id);
create index idx_staff_branch on staff(branch_id);

create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  auth_user_id uuid unique,
  customer_code text,
  full_name text not null,
  phone text not null,
  email text,
  address text,
  id_proof_type id_proof_type,
  id_proof_number_encrypted bytea,
  date_of_birth date,
  gender text,
  photo_url text,
  guarantor_name text,
  guarantor_phone text,
  assigned_agent_id uuid references staff(id) on delete set null,
  portal_access_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, customer_code),
  unique(organization_id, phone)
);
create index idx_customers_org on customers(organization_id);
create index idx_customers_agent on customers(assigned_agent_id);
create index idx_customers_auth_user on customers(auth_user_id);

create table loan_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  interest_type interest_type not null,
  interest_rate_annual numeric(6,3) not null check (interest_rate_annual >= 0),
  collection_frequency collection_frequency not null,
  min_amount numeric(12,2) not null check (min_amount > 0),
  max_amount numeric(12,2) not null check (max_amount >= min_amount),
  min_tenure integer not null check (min_tenure > 0),
  max_tenure integer not null check (max_tenure >= min_tenure),
  late_fee_type late_fee_type not null default 'flat',
  late_fee_value numeric(12,2) not null default 0,
  processing_fee numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_loan_products_org on loan_products(organization_id);

create table loans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  loan_product_id uuid not null references loan_products(id) on delete restrict,
  loan_code text not null,

  principal_amount numeric(12,2) not null check (principal_amount > 0),
  interest_type interest_type not null,
  interest_rate_annual numeric(6,3) not null,
  collection_frequency collection_frequency not null,
  tenure integer not null check (tenure > 0),

  installment_amount numeric(12,2) not null,
  total_payable numeric(12,2) not null,
  total_collected numeric(12,2) not null default 0,
  outstanding_balance numeric(12,2) not null,

  status loan_status not null default 'pending_approval',
  assigned_agent_id uuid references staff(id) on delete set null,
  applied_by uuid references staff(id) on delete set null,
  approved_by uuid references staff(id) on delete set null,
  approved_at timestamptz,
  rejected_reason text,
  disbursed_by uuid references staff(id) on delete set null,
  disbursed_at timestamptz,
  start_date date,
  expected_end_date date,
  closed_at timestamptz,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, loan_code)
);
create index idx_loans_org_status on loans(organization_id, status);
create index idx_loans_customer on loans(customer_id);
create index idx_loans_agent on loans(assigned_agent_id);

create table loan_schedule (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references loans(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  principal_component numeric(12,2) not null,
  interest_component numeric(12,2) not null,
  due_amount numeric(12,2) not null,
  paid_amount numeric(12,2) not null default 0,
  status schedule_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(loan_id, installment_number)
);
create index idx_schedule_loan on loan_schedule(loan_id);
create index idx_schedule_due_status on loan_schedule(due_date, status);

create table collections (
  id uuid primary key default gen_random_uuid(),
  client_generated_id uuid not null unique,
  organization_id uuid not null references organizations(id) on delete cascade,
  loan_id uuid not null references loans(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  collected_by uuid not null references staff(id) on delete restrict,

  amount numeric(12,2) not null check (amount > 0),
  collection_date date not null,
  collected_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  collection_method collection_method not null default 'cash',
  receipt_number text,

  latitude numeric(9,6),
  longitude numeric(9,6),
  photo_url text,
  notes text,

  status collection_status not null default 'recorded',
  reversed_reason text,
  reversed_by uuid references staff(id) on delete set null,
  reversed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, receipt_number)
);
create index idx_collections_loan on collections(loan_id);
create index idx_collections_org_date on collections(organization_id, collection_date);
create index idx_collections_agent_date on collections(collected_by, collection_date);

create table cash_deposits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id uuid not null references staff(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  deposit_date date not null,
  verified_by uuid references staff(id) on delete set null,
  verified_at timestamptz,
  status deposit_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_deposits_org_date on cash_deposits(organization_id, deposit_date);
create index idx_deposits_agent on cash_deposits(agent_id);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  related_entity_type document_related_type not null,
  related_entity_id uuid not null,
  document_type text not null,
  file_path text not null,
  file_size_bytes bigint,
  mime_type text,
  uploaded_by uuid references staff(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_documents_entity on documents(related_entity_type, related_entity_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  recipient_type notification_recipient_type not null,
  recipient_staff_id uuid references staff(id) on delete cascade,
  recipient_customer_id uuid references customers(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint chk_notification_recipient check (
    (recipient_type = 'staff' and recipient_staff_id is not null and recipient_customer_id is null)
    or
    (recipient_type = 'customer' and recipient_customer_id is not null and recipient_staff_id is null)
  )
);
create index idx_notifications_staff on notifications(recipient_staff_id, is_read);
create index idx_notifications_customer on notifications(recipient_customer_id, is_read);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_staff_id uuid references staff(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_audit_org_entity on audit_logs(organization_id, entity_type, entity_id);
create index idx_audit_created on audit_logs(created_at);

-- Role Setup
create role pigmie_app with login password 'dummy_password_for_migration';
grant usage on schema public to pigmie_app;
grant select, insert, update, delete on all tables in schema public to pigmie_app;
grant usage, select on all sequences in schema public to pigmie_app;
alter default privileges in schema public grant select, insert, update, delete on tables to pigmie_app;

-- RLS Helper Functions
create or replace function public.current_staff_org_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from staff where auth_user_id = auth.uid() and is_active = true;
$$;

create or replace function public.request_organization_id()
returns uuid
language sql stable as $$
  select coalesce(
    public.current_staff_org_id(),
    nullif(current_setting('app.current_org_id', true), '')::uuid
  );
$$;

-- RLS Policies
alter table organizations enable row level security;
create policy "organizations read" on organizations for select using (id = public.request_organization_id());
create policy "organizations update" on organizations for update using (id = public.request_organization_id());
create policy "organizations insert" on organizations for insert with check (true);

alter table branches enable row level security;
create policy "branches read" on branches for select using (organization_id = public.request_organization_id());
create policy "branches write" on branches for insert with check (organization_id = public.request_organization_id());
create policy "branches update" on branches for update using (organization_id = public.request_organization_id());

alter table staff enable row level security;
create policy "staff read" on staff for select using (organization_id = public.request_organization_id() or auth_user_id = auth.uid());
create policy "staff write" on staff for insert with check (organization_id = public.request_organization_id());
create policy "staff update" on staff for update using (organization_id = public.request_organization_id() or auth_user_id = auth.uid());

alter table customers enable row level security;
create policy "read customers in your organization" on customers for select using (organization_id = public.request_organization_id());
create policy "write customers in your organization" on customers for insert with check (organization_id = public.request_organization_id());
create policy "update customers in your organization" on customers for update using (organization_id = public.request_organization_id());
create policy "customers read their own record" on customers for select using (auth_user_id = auth.uid());

alter table loan_products enable row level security;
create policy "loan_products read" on loan_products for select using (organization_id = public.request_organization_id());
create policy "loan_products write" on loan_products for insert with check (organization_id = public.request_organization_id());
create policy "loan_products update" on loan_products for update using (organization_id = public.request_organization_id());

alter table loans enable row level security;
create policy "read loans in your organization" on loans for select using (organization_id = public.request_organization_id());
create policy "write loans in your organization" on loans for insert with check (organization_id = public.request_organization_id());
create policy "update loans in your organization" on loans for update using (organization_id = public.request_organization_id());
create policy "customers read their own loans" on loans for select using (customer_id in (select id from customers where auth_user_id = auth.uid()));

alter table loan_schedule enable row level security;
create policy "loan_schedule read" on loan_schedule for select using (
  loan_id in (select id from loans where organization_id = public.request_organization_id() or customer_id in (select id from customers where auth_user_id = auth.uid()))
);
create policy "loan_schedule write" on loan_schedule for insert with check (loan_id in (select id from loans where organization_id = public.request_organization_id()));
create policy "loan_schedule update" on loan_schedule for update using (loan_id in (select id from loans where organization_id = public.request_organization_id()));

alter table collections enable row level security;
create policy "read collections in your organization" on collections for select using (organization_id = public.request_organization_id());
create policy "insert collections in your organization" on collections for insert with check (organization_id = public.request_organization_id());
create policy "customers read collections on their own loans" on collections for select using (customer_id in (select id from customers where auth_user_id = auth.uid()));

alter table cash_deposits enable row level security;
create policy "cash_deposits read" on cash_deposits for select using (organization_id = public.request_organization_id());
create policy "cash_deposits write" on cash_deposits for insert with check (organization_id = public.request_organization_id());
create policy "cash_deposits update" on cash_deposits for update using (organization_id = public.request_organization_id());

alter table documents enable row level security;
create policy "documents read" on documents for select using (organization_id = public.request_organization_id());
create policy "documents write" on documents for insert with check (organization_id = public.request_organization_id());
create policy "documents update" on documents for update using (organization_id = public.request_organization_id());

alter table notifications enable row level security;
create policy "notifications read" on notifications for select using (organization_id = public.request_organization_id() or recipient_customer_id in (select id from customers where auth_user_id = auth.uid()));
create policy "notifications write" on notifications for insert with check (organization_id = public.request_organization_id());
create policy "notifications update" on notifications for update using (organization_id = public.request_organization_id() or recipient_customer_id in (select id from customers where auth_user_id = auth.uid()));

alter table audit_logs enable row level security;
create policy "audit_logs read" on audit_logs for select using (organization_id = public.request_organization_id());
create policy "audit_logs write" on audit_logs for insert with check (organization_id = public.request_organization_id());
-- No UPDATE or DELETE on audit_logs intentionally

-- Triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated_at before update on organizations for each row execute function public.set_updated_at();
create trigger trg_branches_updated_at before update on branches for each row execute function public.set_updated_at();
create trigger trg_staff_updated_at before update on staff for each row execute function public.set_updated_at();
create trigger trg_customers_updated_at before update on customers for each row execute function public.set_updated_at();
create trigger trg_loan_products_updated_at before update on loan_products for each row execute function public.set_updated_at();
create trigger trg_loans_updated_at before update on loans for each row execute function public.set_updated_at();
create trigger trg_loan_schedule_updated_at before update on loan_schedule for each row execute function public.set_updated_at();
create trigger trg_collections_updated_at before update on collections for each row execute function public.set_updated_at();
create trigger trg_cash_deposits_updated_at before update on cash_deposits for each row execute function public.set_updated_at();

create or replace function public.sync_loan_totals()
returns trigger language plpgsql as $$
declare
  v_loan_id uuid := coalesce(new.loan_id, old.loan_id);
begin
  update loans l
  set total_collected = coalesce((
        select sum(c.amount) from collections c
        where c.loan_id = v_loan_id and c.status in ('recorded', 'verified')
      ), 0),
      updated_at = now()
  where l.id = v_loan_id;

  update loans
  set outstanding_balance = total_payable - total_collected
  where id = v_loan_id;

  return coalesce(new, old);
end;
$$;

create trigger trg_sync_loan_totals
  after insert or update or delete on collections
  for each row execute function public.sync_loan_totals();
