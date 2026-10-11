-- Add indexes used by scoped schedule and collection queries.
BEGIN;
CREATE INDEX "collections_organization_id_collection_date_status_idx" ON "collections"("organization_id", "collection_date", "status");
CREATE INDEX "loan_schedule_loan_id_status_due_date_idx" ON "loan_schedule"("loan_id", "status", "due_date");
COMMIT;
