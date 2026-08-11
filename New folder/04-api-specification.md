# 04 — API Specification

## 1. Conventions

- **Base URL:** `https://<your-render-app>.onrender.com/api/v1`
- **Auth:** every endpoint except `/health` requires `Authorization: Bearer <supabase-jwt>`. The token comes from the Supabase client SDK session on the frontend — **login, logout, session refresh, and password reset are handled by the Supabase client directly and are not proxied through this API** (there is deliberately no `POST /auth/login` here).
- **Content-Type:** `application/json`, except file uploads which go directly to Supabase Storage from the client (see `06-security-architecture.md §5` for the signed-upload pattern).
- **Pagination:** list endpoints accept `?page=1&limit=20` (default `limit=20`, max `100`) and respond with:
  ```json
  { "data": [ /* ... */ ], "meta": { "page": 1, "limit": 20, "total": 137, "totalPages": 7 } }
  ```
- **Errors:** a consistent envelope on every non-2xx response:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "amount must be greater than 0", "details": { "field": "amount" } } }
  ```
  Standard codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).
- **Role gating** is written per-endpoint below as the minimum role required; `org_admin` can do anything a more restricted role can within their organization.
- **`GET /health`** — unauthenticated, performs `SELECT 1` against the database and returns `{ "status": "ok" }`. This exists specifically to be the target of the UptimeRobot keep-alive ping (`02-architecture-and-tech-stack.md §8`) — a health check that doesn't touch the database wouldn't prevent the Supabase pause.

## 2. Auth & Session

There's no login endpoint here by design (see above). What the backend *does* own:

### `GET /auth/me`
**Auth:** any authenticated user.
Resolves the caller's Supabase identity into their Pigmie profile — the frontend calls this once after a Supabase login to know who it's talking to and what to render.

Response 200 (staff):
```json
{
  "userType": "staff",
  "id": "b3f1...",
  "organizationId": "9a12...",
  "branchId": "44de...",
  "fullName": "Anita Rao",
  "role": "agent",
  "twoFactorEnabled": true
}
```
Response 200 (customer):
```json
{
  "userType": "customer",
  "id": "e7c2...",
  "organizationId": "9a12...",
  "fullName": "Ramesh Kumar",
  "activeLoanCount": 1
}
```

### `POST /auth/2fa/setup`
**Auth:** staff only. Generates a TOTP secret server-side (via `otplib`), stores it **encrypted** against the caller's `staff` row (not yet marking `two_factor_enabled = true`), and returns a QR-code payload.
Response 200: `{ "secret": "JBSWY3DPEHPK3PXP", "otpAuthUrl": "otpauth://totp/Pigmie:anita@org.com?secret=...&issuer=Pigmie" }`

### `POST /auth/2fa/enable`
**Auth:** staff only. Body: `{ "code": "123456" }`. Verifies the code against the stored secret; on success sets `two_factor_enabled = true`. From this point, the login flow requires a second `POST /auth/2fa/verify` step before the frontend treats the Supabase session as fully authenticated for sensitive actions.

### `POST /auth/2fa/verify`
Body: `{ "code": "123456" }`. Returns `{ "verified": true }` or a 401.

### `POST /auth/2fa/disable`
**Auth:** staff (self) or `org_admin` (for another staff member, e.g. lost device recovery). Requires either a valid current TOTP code or org_admin override — the override path writes an `audit_logs` entry, since disabling someone else's 2FA is a sensitive action.

## 3. Organizations & Branches

### `POST /organizations`
**Auth:** any authenticated Supabase user who does not yet belong to an organization — this is the self-service tenant-onboarding entry point, and the only endpoint in the API a brand-new sign-up can call before they have a `staff` row at all. The frontend flow is: user signs up via the Supabase client SDK (email + password) → frontend calls this endpoint with the new session's JWT.

Request:
```json
{ "organizationName": "Sunrise Micro Finance", "operatorType": "organization", "currency": "INR", "timezone": "Asia/Kolkata", "contactPhone": "9876500001" }
```
Server behavior, in one transaction: creates the `organizations` row, then creates a `staff` row for the caller with `role = org_admin`, linking `authUserId` to their existing Supabase identity. Returns the new organization plus the caller's new staff profile — the frontend can immediately proceed as a fully provisioned `org_admin`. Rejects with 409 if the calling `auth_user_id` already has a `staff` or `customers` row anywhere on the platform — one auth identity maps to exactly one organization membership in v1, which keeps "who does this login belong to" unambiguous.

### `GET /organizations/me`
**Auth:** any staff. Returns the caller's own organization — resolved from their `staff` row, never from a client-supplied ID, so there's no parameter to tamper with here.

### `PATCH /organizations/me`
**Auth:** `org_admin`. Body: any subset of `{ name, currency, timezone, contactEmail, contactPhone, address }`.

### `GET /branches`, `POST /branches`, `GET /branches/:id`, `PATCH /branches/:id`, `DELETE /branches/:id`
Standard CRUD. `POST`/`PATCH`/`DELETE` require `org_admin`. `DELETE` sets `is_active = false`, does not hard-delete (staff/customers reference branches).

Shape:
```json
{ "id": "44de...", "name": "Koramangala Branch", "address": "5th Block, Bengaluru", "isActive": true }
```

## 4. Staff

### `GET /staff`
**Auth:** `org_admin`, `branch_manager` (scoped to their own branch). Query: `?role=agent&branchId=...&isActive=true`.

### `POST /staff`
**Auth:** `org_admin`. Creates both the Supabase `auth.users` identity (via the Supabase Admin API, using the service role key — server-side only, never exposed to the frontend) and the `staff` row, then sends a Supabase invite email so the new staff member sets their own password.

Request:
```json
{ "fullName": "Anita Rao", "email": "anita@org.com", "phone": "9876500000", "role": "agent", "branchId": "44de...", "employeeCode": "AGT-014" }
```

### `GET /staff/:id`, `PATCH /staff/:id`
Standard. `PATCH` role changes require `org_admin`; a staff member can `PATCH` their own `phone` only.

### `DELETE /staff/:id`
**Auth:** `org_admin`. Sets `is_active = false` and revokes the Supabase session (does not delete the `auth.users` row or any historical records they created — loans they disbursed, collections they recorded, remain intact and attributed).

## 5. Customers

### `GET /customers`
**Auth:** `agent` (sees only `assignedAgentId = self`), `branch_manager`, `org_admin`. Query: `?search=ramesh&branchId=...&agentId=...&isActive=true`.

### `POST /customers`
**Auth:** `agent` or above.
```json
{
  "fullName": "Ramesh Kumar",
  "phone": "9876543210",
  "address": "12 MG Road, Bengaluru",
  "idProofType": "aadhaar",
  "idProofNumber": "1234-5678-9012",
  "dateOfBirth": "1985-04-12",
  "guarantorName": "Suresh Kumar",
  "guarantorPhone": "9876543211",
  "branchId": "44de...",
  "assignedAgentId": "b3f1..."
}
```
`idProofNumber` is encrypted server-side before storage (`06-security-architecture.md §5`) — it is accepted here in plaintext over TLS and never stored or logged in plaintext afterward.

### `GET /customers/:id`, `PATCH /customers/:id`, `DELETE /customers/:id`
Standard; `DELETE` deactivates.

### `GET /customers/:id/loans`
Returns all loans (any status) for this customer, most recent first.

### `POST /customers/:id/portal-access`
**Auth:** `agent` or above. Requires `email` on the customer record (adds it if not already present, via body `{ "email": "ramesh@example.com" }`). Creates a Supabase `auth.users` entry for the customer, links `customers.auth_user_id`, sets `portal_access_enabled = true`, and triggers a Supabase invite email so the customer sets their own password.

### `DELETE /customers/:id/portal-access`
**Auth:** `agent` or above. Sets `portal_access_enabled = false` and revokes the Supabase session; does not delete the `auth.users` row (re-enabling later doesn't require re-inviting).

### `POST /customers/import`
**Auth:** `org_admin`. Multipart file upload, CSV. Validates every row before committing any (all-or-nothing), returns a per-row result:
```json
{
  "totalRows": 150,
  "successCount": 147,
  "errors": [ { "row": 23, "message": "phone number already exists in organization" } ]
}
```

## 6. Documents

Files upload **directly from the browser to Supabase Storage** using a short-lived signed upload URL (requested from the backend first, so the backend controls which bucket/path/size/mime-type is permitted) — this avoids proxying binary data through the Render API, which has both a request-size and a bandwidth-budget reason to avoid it.

### `POST /documents/upload-url`
**Auth:** `agent` or above. Body: `{ "relatedEntityType": "customer", "relatedEntityId": "e7c2...", "documentType": "aadhaar_front", "mimeType": "image/jpeg" }`.
Response: `{ "uploadUrl": "https://...supabase.co/storage/v1/...", "path": "kyc-documents/9a12.../e7c2.../aadhaar_front-<uuid>.jpg", "expiresIn": 300 }`
Client uploads the file directly to `uploadUrl`, then calls:

### `POST /documents`
Registers the metadata row after a successful upload. Body: `{ "relatedEntityType": "customer", "relatedEntityId": "e7c2...", "documentType": "aadhaar_front", "path": "kyc-documents/...", "fileSizeBytes": 214880, "mimeType": "image/jpeg" }`.

### `GET /documents?relatedEntityType=customer&relatedEntityId=...`
Lists document metadata (not the files themselves).

### `GET /documents/:id/signed-url`
Returns a short-lived (5-minute) signed URL to view/download the actual file — documents are never served from a permanently public URL.

### `DELETE /documents/:id`
**Auth:** `branch_manager` or above.

## 7. Loan Products

### `GET /loan-products`, `POST /loan-products`, `GET /loan-products/:id`, `PATCH /loan-products/:id`, `DELETE /loan-products/:id`
`POST`/`PATCH`/`DELETE` require `org_admin`. `DELETE` deactivates — existing loans keep their snapshotted terms regardless (see `03-database-schema.md §4.6`).

```json
{
  "name": "Daily Micro Loan — Standard",
  "interestType": "reducing_balance",
  "interestRateAnnual": 30.0,
  "collectionFrequency": "daily",
  "minAmount": 2000,
  "maxAmount": 20000,
  "minTenure": 50,
  "maxTenure": 200,
  "lateFeeType": "flat",
  "lateFeeValue": 20,
  "processingFee": 100
}
```

## 8. Loans

Loan state machine (full detail in `05-business-logic-and-calculations.md §6`): `pending_approval → approved → active → closed | defaulted | written_off`, with a `rejected` branch off `pending_approval`.

### `GET /loans`
**Auth:** `agent` (own customers only), `branch_manager`, `org_admin`. Query: `?status=active&customerId=...&agentId=...`.

### `POST /loans`
**Auth:** `agent` or above. Creates a loan in `pending_approval` — **does not** generate a schedule yet, since the schedule needs a `start_date` that's only fixed at disbursement.
```json
{ "customerId": "e7c2...", "loanProductId": "3ab9...", "principalAmount": 10000, "tenure": 100, "assignedAgentId": "b3f1..." }
```
The backend snapshots `interestType`, `interestRateAnnual`, and `collectionFrequency` from the loan product onto the loan row at this point, and validates `principalAmount` and `tenure` against the product's min/max bounds.

### `GET /loans/:id`
Full detail including computed `installmentAmount`, `totalPayable`, `outstandingBalance`.

### `PATCH /loans/:id`
**Auth:** `branch_manager` or above. Only permitted while `status = pending_approval`.

### `POST /loans/:id/approve`
**Auth:** `branch_manager` or above. Sets `status = approved`, `approvedBy`, `approvedAt`. Writes an audit log entry.

### `POST /loans/:id/reject`
**Auth:** `branch_manager` or above. Body: `{ "reason": "..." }`. Sets `status = rejected`.

### `POST /loans/:id/disburse`
**Auth:** `branch_manager` or above. Body: `{ "startDate": "2026-08-10" }`. This is the endpoint with the most side effects in the whole API:
1. Computes `installmentAmount` and `totalPayable` using the loan's snapshotted interest terms (`05-business-logic-and-calculations.md §1–2`).
2. Generates every `loan_schedule` row (`05-business-logic-and-calculations.md §3`).
3. Sets `status = active`, `disbursedBy`, `disbursedAt`, `startDate`, `expectedEndDate`.
4. All of the above happens inside a single database transaction — a partially-generated schedule must never be visible.

Response 200 returns the full loan object plus the generated `schedule` array.

### `GET /loans/:id/schedule`
Returns every `loan_schedule` row for the loan, in installment order, with `status` per row.

### `POST /loans/:id/restructure` *(Phase 3)*
**Auth:** `branch_manager` or above. Body: `{ "fromInstallmentNumber": 34, "newTenure": 80, "reason": "customer requested extension after income disruption" }`. Regenerates schedule rows from the given installment forward across the new tenure, preserving everything already paid. Writes an audit log capturing the full before/after schedule.

### `POST /loans/:id/close`
**Auth:** `branch_manager` or above. Only permitted when `outstandingBalance <= 0`. Sets `status = closed`, `closedAt`.

### `POST /loans/:id/write-off`
**Auth:** `org_admin` only — the one action reserved exclusively for the top role, since it's a portfolio-level financial decision. Body: `{ "reason": "..." }`. Sets `status = written_off`; remaining schedule rows are left as-is for record-keeping (not deleted), so historical reporting on the loan stays accurate.

### `GET /loans/:id/statement`
Returns a generated PDF (via `pdf-lib` on the backend — see `08-backend-implementation-guide.md`) covering principal, terms, full schedule, and every collection against the loan.

## 9. Collections

This is the highest-frequency write in the whole system — designed for the agent-in-the-field case first.

### `GET /collections`
**Auth:** `agent` (own only), `branch_manager`, `org_admin`. Query: `?loanId=...&agentId=...&dateFrom=...&dateTo=...`.

### `GET /collections/due-today`
**Auth:** `agent` or above. For an agent, returns every `loan_schedule` row that's `pending` or `overdue` and due on or before today, across their assigned customers — this is the data behind the agent's daily collection route. For `branch_manager`/`org_admin`, accepts `?agentId=` to view any agent's list.
```json
{
  "data": [
    {
      "loanId": "7f2a...",
      "customerId": "e7c2...",
      "customerName": "Ramesh Kumar",
      "customerPhone": "9876543210",
      "installmentNumber": 34,
      "dueDate": "2026-08-07",
      "dueAmount": 52.00,
      "daysOverdue": 0
    }
  ]
}
```

### `POST /collections`
**Auth:** `agent` or above. The online (connected) path.
```json
{
  "clientGeneratedId": "c9f0-...-uuid-from-device",
  "loanId": "7f2a...",
  "amount": 52.00,
  "collectionDate": "2026-08-07",
  "collectedAt": "2026-08-07T09:14:00+05:30",
  "collectionMethod": "cash",
  "latitude": 12.9352,
  "longitude": 77.6146,
  "photoPath": "collection-photos/9a12.../c9f0....jpg"
}
```
Server behavior: validates the loan is `active`, applies the payment to the schedule oldest-due-first (`05-business-logic-and-calculations.md §4`), inserts the `collections` row (the `sync_loan_totals` trigger updates the loan's running totals automatically), generates a `receiptNumber`, writes an audit log, and returns the updated loan + schedule state alongside the created collection.

### `POST /collections/sync`
**Auth:** `agent` or above. The offline-queue path — accepts an **array** of collection objects (same shape as above), each carrying its own `clientGeneratedId`. Processes each independently; upserts on `clientGeneratedId` so a retried sync from a flaky connection never double-counts. Response reports per-item success/failure so the device can clear its local queue for the ones that succeeded and retry only the ones that didn't:
```json
{
  "results": [
    { "clientGeneratedId": "c9f0-...", "status": "created", "collectionId": "d81e..." },
    { "clientGeneratedId": "a771-...", "status": "duplicate", "collectionId": "b220..." },
    { "clientGeneratedId": "9e40-...", "status": "error", "message": "loan is not active" }
  ]
}
```

### `GET /collections/:id`

### `POST /collections/:id/reverse`
**Auth:** `branch_manager` or above. Body: `{ "reason": "customer disputes amount, corrected entry filed separately" }`. Sets `status = reversed` on the original row — **does not delete it**. The `sync_loan_totals` trigger only counts `recorded`/`verified` collections toward the loan balance, so a reversed collection is automatically excluded without ever losing the historical record of the original entry (this is why collections has no `UPDATE`/`DELETE` RLS policy at all, per `03-database-schema.md §5` — corrections are additive, not destructive, by construction).

### `GET /collections/:id/receipt`
Returns a generated PDF receipt.

## 10. Cash Deposits

### `GET /cash-deposits`, `POST /cash-deposits`
**Auth:** `agent` (creates their own), `branch_manager`/`org_admin` (view all).
```json
{ "amount": 4200.00, "depositDate": "2026-08-07", "notes": "week ending Aug 7" }
```

### `POST /cash-deposits/:id/verify`
**Auth:** `branch_manager` or above. Body: `{ "status": "verified" | "discrepancy", "notes": "..." }`.

### `GET /cash-deposits/reconciliation`
**Auth:** `branch_manager` or above. Query: `?agentId=...&dateFrom=...&dateTo=...`. Returns, per agent: sum of collections recorded vs. sum of deposits verified in the period, and the delta.

## 11. Reports

### `GET /reports/dashboard-summary`
**Auth:** `branch_manager` or above.
```json
{
  "activeLoans": 342,
  "totalOutstanding": 1284500.00,
  "collectedToday": 18420.00,
  "dueToday": 21150.00,
  "overdueCount": 19,
  "portfolioAtRisk30": 0.041
}
```

### `GET /reports/overdue`
Query: `?minDaysOverdue=1&branchId=...&agentId=...`. Returns every loan with at least one overdue installment, sorted by days overdue descending.

### `GET /reports/portfolio-at-risk`
Query: `?asOf=2026-08-07`. Returns PAR at the standard 1/30/90-day thresholds — see `05-business-logic-and-calculations.md §7` for the exact formula this implements.

### `GET /reports/collection-efficiency`
Query: `?dateFrom=&dateTo=&groupBy=agent|branch|day`.

### `GET /reports/agent-performance`
Per-agent: customers assigned, collections made, collection efficiency, cash reconciliation status.

### `GET /reports/export`
Query: `?type=customers|loans|collections|schedule&format=csv`. Streams a CSV of the full underlying data (not just the summarized report) — this is the "we are never locked in" safety valve mentioned in the product overview.

## 12. Notifications

### `GET /notifications`
**Auth:** any authenticated user; returns their own notifications only (enforced by scoping to `recipientStaffId`/`recipientCustomerId` matching the caller).

### `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`

## 13. Customer Portal

Same JWT, different prefix — kept visually distinct so it's obvious in code review that these endpoints must never leak data belonging to another customer. Every handler in this module resolves `customerId` from the caller's own `auth_user_id`, never from a request parameter.

### `GET /portal/me`
```json
{ "fullName": "Ramesh Kumar", "phone": "9876543210", "activeLoans": 1 }
```

### `GET /portal/loans`
All of the caller's own loans, any status.

### `GET /portal/loans/:id`
**403, not 404**, if the loan doesn't belong to the caller — the distinction matters for not leaking loan-ID existence, but in this case there's no meaningful information disclosed either way since loan IDs are random UUIDs; 403 is used for consistency with the rest of the portal module.

### `GET /portal/loans/:id/schedule`
### `GET /portal/loans/:id/collections`
### `GET /portal/loans/:id/statement`
Same PDF as the staff-facing statement endpoint, re-exposed under the portal prefix with the ownership check applied.
