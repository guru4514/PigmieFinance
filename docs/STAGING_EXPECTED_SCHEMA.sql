-- REFERENCE ONLY: generated from the Prisma model; omits RLS/grants/triggers.
-- Do not apply this file as a bootstrap or migration.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('org_admin', 'branch_manager', 'agent', 'accountant');

-- CreateEnum
CREATE TYPE "id_proof_type" AS ENUM ('aadhaar', 'pan', 'voter_id', 'passport', 'driving_license', 'other');

-- CreateEnum
CREATE TYPE "kyc_status" AS ENUM ('not_submitted', 'submitted', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "interest_type" AS ENUM ('flat', 'reducing_balance');

-- CreateEnum
CREATE TYPE "collection_frequency" AS ENUM ('daily', 'weekly', 'biweekly', 'monthly');

-- CreateEnum
CREATE TYPE "late_fee_type" AS ENUM ('flat', 'percentage');

-- CreateEnum
CREATE TYPE "loan_status" AS ENUM ('pending_approval', 'approved', 'rejected', 'active', 'closed', 'defaulted', 'written_off');

-- CreateEnum
CREATE TYPE "schedule_status" AS ENUM ('pending', 'partially_paid', 'paid', 'overdue', 'waived');

-- CreateEnum
CREATE TYPE "collection_method" AS ENUM ('cash', 'cheque', 'other');

-- CreateEnum
CREATE TYPE "collection_status" AS ENUM ('recorded', 'verified', 'disputed', 'reversed');

-- CreateEnum
CREATE TYPE "deposit_status" AS ENUM ('pending', 'verified', 'discrepancy');

-- CreateEnum
CREATE TYPE "document_related_type" AS ENUM ('customer', 'loan', 'collection');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('delete_customer', 'reverse_collection', 'close_loan', 'write_off_loan', 'restructure_loan');

-- CreateEnum
CREATE TYPE "notification_recipient_type" AS ENUM ('staff', 'customer');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "operator_type" TEXT NOT NULL DEFAULT 'organization',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "auth_user_id" UUID NOT NULL,
    "employee_code" TEXT,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "two_factor_secret" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "branch_id" UUID,
    "auth_user_id" UUID,
    "customer_code" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "id_proof_type" "id_proof_type",
    "id_proof_number_encrypted" BYTEA,
    "date_of_birth" DATE,
    "gender" TEXT,
    "photo_url" TEXT,
    "guarantor_name" TEXT,
    "guarantor_phone" TEXT,
    "assigned_agent_id" UUID,
    "portal_access_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "kyc_status" "kyc_status" NOT NULL DEFAULT 'not_submitted',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "interest_type" "interest_type" NOT NULL,
    "interest_rate_annual" DECIMAL(6,3) NOT NULL,
    "collection_frequency" "collection_frequency" NOT NULL,
    "min_amount" DECIMAL(12,2) NOT NULL,
    "max_amount" DECIMAL(12,2) NOT NULL,
    "min_tenure" INTEGER NOT NULL,
    "max_tenure" INTEGER NOT NULL,
    "late_fee_type" "late_fee_type" NOT NULL DEFAULT 'flat',
    "late_fee_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "processing_fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "loan_product_id" UUID NOT NULL,
    "loan_code" TEXT NOT NULL,
    "principal_amount" DECIMAL(12,2) NOT NULL,
    "interest_type" "interest_type" NOT NULL,
    "interest_rate_annual" DECIMAL(6,3) NOT NULL,
    "collection_frequency" "collection_frequency" NOT NULL,
    "tenure" INTEGER NOT NULL,
    "installment_amount" DECIMAL(12,2) NOT NULL,
    "total_payable" DECIMAL(12,2) NOT NULL,
    "total_collected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstanding_balance" DECIMAL(12,2) NOT NULL,
    "status" "loan_status" NOT NULL DEFAULT 'pending_approval',
    "assigned_agent_id" UUID,
    "applied_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "rejected_reason" TEXT,
    "disbursed_by" UUID,
    "disbursed_at" TIMESTAMPTZ,
    "start_date" DATE,
    "expected_end_date" DATE,
    "closed_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_schedule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "principal_component" DECIMAL(12,2) NOT NULL,
    "interest_component" DECIMAL(12,2) NOT NULL,
    "due_amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "schedule_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_generated_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "collected_by" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "collection_date" DATE NOT NULL,
    "collected_at" TIMESTAMPTZ NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collection_method" "collection_method" NOT NULL DEFAULT 'cash',
    "receipt_number" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "photo_url" TEXT,
    "notes" TEXT,
    "status" "collection_status" NOT NULL DEFAULT 'recorded',
    "reversed_reason" TEXT,
    "reversed_by" UUID,
    "reversed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_deposits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "deposit_date" DATE NOT NULL,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "status" "deposit_status" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "related_entity_type" "document_related_type" NOT NULL,
    "related_entity_id" UUID NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size_bytes" BIGINT,
    "mime_type" TEXT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "recipient_type" "notification_recipient_type" NOT NULL,
    "recipient_staff_id" UUID,
    "recipient_customer_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "related_entity_type" TEXT,
    "related_entity_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "actor_staff_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actionType" "ApprovalActionType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "reason" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_branches_org" ON "branches"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_auth_user_id_key" ON "staff"("auth_user_id");

-- CreateIndex
CREATE INDEX "idx_staff_org" ON "staff"("organization_id");

-- CreateIndex
CREATE INDEX "idx_staff_auth_user" ON "staff"("auth_user_id");

-- CreateIndex
CREATE INDEX "idx_staff_branch" ON "staff"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_organization_id_employee_code_key" ON "staff"("organization_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_auth_user_id_key" ON "customers"("auth_user_id");

-- CreateIndex
CREATE INDEX "idx_customers_org" ON "customers"("organization_id");

-- CreateIndex
CREATE INDEX "idx_customers_agent" ON "customers"("assigned_agent_id");

-- CreateIndex
CREATE INDEX "idx_customers_auth_user" ON "customers"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_customer_code_key" ON "customers"("organization_id", "customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_organization_id_phone_key" ON "customers"("organization_id", "phone");

-- CreateIndex
CREATE INDEX "idx_loan_products_org" ON "loan_products"("organization_id");

-- CreateIndex
CREATE INDEX "idx_loans_org_status" ON "loans"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_loans_customer" ON "loans"("customer_id");

-- CreateIndex
CREATE INDEX "idx_loans_agent" ON "loans"("assigned_agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "loans_organization_id_loan_code_key" ON "loans"("organization_id", "loan_code");

-- CreateIndex
CREATE INDEX "idx_schedule_loan" ON "loan_schedule"("loan_id");

-- CreateIndex
CREATE INDEX "idx_schedule_due_status" ON "loan_schedule"("due_date", "status");

-- CreateIndex
CREATE INDEX "loan_schedule_loan_id_status_due_date_idx" ON "loan_schedule"("loan_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "loan_schedule_loan_id_installment_number_key" ON "loan_schedule"("loan_id", "installment_number");

-- CreateIndex
CREATE UNIQUE INDEX "collections_client_generated_id_key" ON "collections"("client_generated_id");

-- CreateIndex
CREATE INDEX "idx_collections_loan" ON "collections"("loan_id");

-- CreateIndex
CREATE INDEX "idx_collections_org_date" ON "collections"("organization_id", "collection_date");

-- CreateIndex
CREATE INDEX "collections_organization_id_collection_date_status_idx" ON "collections"("organization_id", "collection_date", "status");

-- CreateIndex
CREATE INDEX "idx_collections_agent_date" ON "collections"("collected_by", "collection_date");

-- CreateIndex
CREATE UNIQUE INDEX "collections_organization_id_receipt_number_key" ON "collections"("organization_id", "receipt_number");

-- CreateIndex
CREATE INDEX "idx_deposits_org_date" ON "cash_deposits"("organization_id", "deposit_date");

-- CreateIndex
CREATE INDEX "idx_deposits_agent" ON "cash_deposits"("agent_id");

-- CreateIndex
CREATE INDEX "idx_documents_entity" ON "documents"("related_entity_type", "related_entity_id");

-- CreateIndex
CREATE INDEX "idx_notifications_staff" ON "notifications"("recipient_staff_id", "is_read");

-- CreateIndex
CREATE INDEX "idx_notifications_customer" ON "notifications"("recipient_customer_id", "is_read");

-- CreateIndex
CREATE INDEX "idx_audit_org_entity" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_created" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_auth_user_id_idx" ON "push_subscriptions"("auth_user_id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loan_products" ADD CONSTRAINT "loan_products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_loan_product_id_fkey" FOREIGN KEY ("loan_product_id") REFERENCES "loan_products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_assigned_agent_id_fkey" FOREIGN KEY ("assigned_agent_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_disbursed_by_fkey" FOREIGN KEY ("disbursed_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "loan_schedule" ADD CONSTRAINT "loan_schedule_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_deposits" ADD CONSTRAINT "cash_deposits_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_staff_id_fkey" FOREIGN KEY ("recipient_staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_customer_id_fkey" FOREIGN KEY ("recipient_customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_staff_id_fkey" FOREIGN KEY ("actor_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
