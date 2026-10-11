# Pigmie Finance: Indian product viability research

Research date: 11 October 2026. Scope: desk research using official statistics, regulator/government publications and competitors' own product pages; review of current product scope, schema, application and release checkpoint. No customer interviews, competitor purchases, product usability study or paid demand experiment was conducted. Competitor claims are not independently verified. This is a product decision document, not a certification of legal compliance.

## Decision

Continue the project as a narrowly targeted loan collection and reconciliation product. Validate buyer demand now while completing the necessary safety gates. Defer a broad mobile rebuild, savings/deposit products, a general accounting suite and enterprise microfinance positioning until the initial segment proves adoption and payment.

The product addresses a credible operational problem. Commercial success and user satisfaction remain unproven. A profitable regional software business is a more defensible initial objective than assuming nationwide scale. Existing code and successful tests demonstrate engineering progress, not product-market fit.

## Evidence and its limits

Sa-Dhan's Bharat Microfinance Report 2025 shows 627 lakh client outreach and ₹2,38,198 crore outstanding portfolio for its MLI model, with 80% rural clients. Its 2024 comparators are higher for outreach and portfolio. These are dated institutional sector measures, not unique prospective software buyers or Pigmie's addressable market. They support the relevance of field operations while cautioning against a simple high-growth narrative. A newer Q1 FY2026–27 report was listed, but its linked document could not be retrieved in this session; no figures from it are claimed. [Sa-Dhan BMR 2025](https://www.sa-dhan.net/BMR/2025/), [quarterly report listing](https://www.sa-dhan.net/quarterly-mf-report/).

MoSPI's January–March 2025 telecom survey reports smartphone ownership in 85.5% of households. Household access does not prove each borrower owns a private device, has continuous connectivity or can navigate an English finance application. Mobile field tools are plausible; a mandatory borrower app would need separate evidence. [MoSPI survey release](https://www.mospi.gov.in/sites/default/files/press_release/Final_press%20release_CMS_T.pdf).

NPCI reports 24,068.38 million UPI transactions in September 2026. This is nationwide payments activity, not loan repayment share. The product inference is to accommodate digital repayment records and reconciliation rather than assume cash-only workflows remain sufficient. [NPCI statistics](https://www.npci.org.in/product/upi/product-statistics).

## What the current product actually serves

The repository describes recording cash repayment, loan schedules, approvals, customer records, branch/agent permissions, cash handovers and borrower statements. It explicitly excludes payment processing, formal organization-wide accounting and credit-bureau services. The inspected language configuration loads English and Hindi. A translation framework is not complete regional-language coverage or evidence of usability.

CashDeposit represents an agent handing collected money to the organization. It is not a customer savings account. No inspected schema module establishes a full savings lifecycle with account balances, withdrawals, deposit interest and maturity. The name Pigmie and piggy-bank imagery can create a different expectation. Use an explicit descriptor such as “Loan Collections & Cash Reconciliation”; assess naming with prospects before spending on branding. Do not add a savings module merely to match the name.

The current code is not release-ready. The checkpoint records 335 backend tests and 62 web tests, but private collection photos, actual offline cold start/recovery, development schema reconciliation, privileged backend isolation, scheduled/historical reconciliation and other security/operational gates remain open. See [release checkpoint](RELEASE_CHECKPOINT.md). Earlier scope claims about immutable audits, load-bearing RLS and offline sign-in are design intentions, not established runtime guarantees. An offline authenticator can generate a code without connectivity; provider verification and initial authenticated data loading still require network behavior that must be tested.

## Initial customer hypothesis

Choose one reachable district/state and one legally permitted lender category. A useful discovery hypothesis is an organization with roughly 2–20 field staff, 1–5 branches and 500–5,000 active loan accounts, still using paper/Excel or dissatisfied with an existing tool. These ranges are proposed selection criteria, not researched market averages.

The organization owner is the buyer; agents are daily users; accountants/managers validate balances; borrowers benefit from clear records. Interview all four perspectives. Winning owner approval without agent adoption will not deliver trustworthy data.

| Segment | Present fit | Decision |
|---|---|---|
| Legally operating small lenders with a field collection team | Closest workflow match; demand and permission still need validation | First discovery/pilot segment |
| Solo lender with a small book | May prefer a cheap ledger; support costs can exceed subscription | Secondary, only if onboarding becomes largely self-service |
| Larger NBFC/MFI | Broader underwriting, group/center, integration and regulatory needs | Avoid claiming enterprise replacement |
| Cooperative/pigmy savings operator | Savings/accounting product gap; distinct legal category | Separate future discovery |
| Chit fund operator | Different subscription, auction and payout workflows | Not the present product |
| Borrower seeking a personal loan app | Not the SaaS buyer; product does not supply loans | Do not position here |

## Competition and differentiation

| Alternative | Verified advertised offering | Implication |
|---|---|---|
| RupeeCollect | ₹1,000/year plus GST, multi-employee roles, collection schedules, web/Android and nine languages; savings also advertised | Generic ledgers face a very low price anchor |
| Daily Collection | Vendor advertises an offline mobile app for daily/weekly EMI teams | Offline capability alone is not a unique proposition |
| Finflux by M2P | Vendor describes offline/digital collections, household assessment, center/group management and savings | Established enterprise products have wider domain coverage |
| Paper, spreadsheets and existing local software | Prospects' actual substitute is unknown until discovery | Compare against the current process, not only named vendors |

Sources: [RupeeCollect product and pricing](https://www.rupeecollect.in/), [RupeeCollect FAQ](https://www.rupeecollect.in/faq), [Daily Collection](https://dailycollection.co.in/), [M2P microfinance suite](https://m2pfintech.com/micro-finance/). Pricing and feature statements were observed on vendor pages; reliability, security, customer counts and testimonials were not independently verified.

Do not compete on feature count or a generic “secure and easy” claim. Test a concrete promise: an agent completes a repayment record quickly despite poor connectivity, while the owner can close the day with every collection, cash handover and exception accounted for. Independent receipts, traceable corrections, assisted import, regional support and verified restore can make this credible, but remain hypotheses until measured.

## What users are likely to value or dislike

Owners may value rapid answers to outstanding amounts, overdue accounts and cash expected from each agent. Accountants need exportable opening balances, charges, repayments, reversals and adjustments with a clear explanation. Agents need fast search, large controls, local language and reliable pending/synced states. Borrowers need understandable balances and receipts without being forced to install software. These are workflow hypotheses, not interview findings.

Sources of rejection include slow screens, lengthy setup, repeated login friction, wrong opening balances, disappeared offline records, compulsory photos at every visit, surveillance-like location use and inability to export data. Restrict evidence capture to justified cases and define consent and retention. Preserve mandatory staff security while testing session/recovery usability; do not remove MFA for convenience.

A digital log does not prove that physical cash was received. GPS/photo evidence cannot guarantee this either. Clearly separate agent-recorded collection, server acknowledgement, cash handover and independent verification. A pending offline record must not look like a final server-confirmed receipt. Corrections require reasoned, traceable reversals rather than silent edits.

## Legal and regulatory product implications

Applicability depends on lender category, state and actual service role. The RBI's 2025 Digital Lending Directions cover regulated digital lending and include KFS/APR, consent, grievance and India-based storage requirements. Software that does not itself move money is not automatically outside those arrangements. Singapore development hosting is acceptable for the stated synthetic testing, but would require review before an applicable Indian regulated deployment; India staging alone does not verify all processors/backups. Have the chosen service classified before onboarding real borrowers. [RBI Directions](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12848&Mode=0).

For applicable RBI microfinance loans, household income/indebtedness assessment, repayment burden limits, borrower disclosures and acknowledgement matter; prepayment penalties are prohibited and late penalties apply only to overdue amounts. A generic interest calculator and an arbitrary closure fee cannot establish compliance. [RBI microfinance FAQ](https://www.rbi.org.in/commonperson/English/Scripts/FAQs.aspx?Id=3366). Other prepayment restrictions also depend on loan/lender type and sanction date. [RBI prepayment directions](https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12878&Mode=0).

State-regulated lending is a separate question: Karnataka's Act, for example, provides for money-lender licensing and accounts/statements. An organization registration in the application does not establish a lending licence. [Karnataka Act](https://www.indiacode.nic.in/bitstream/123456789/7208/1/12_of_1962_%28e%29.pdf). Public savings/deposit-taking requires a distinct legal assessment; the Banning of Unregulated Deposit Schemes Act prohibits unregulated schemes. [Deposit Schemes Act](https://www.indiacode.nic.in/bitstream/123456789/11641/1/A2019-21.pdf).

DPDP Rules 2025 have phased commencement; do not label every operational rule fully effective on 11 October 2026. Build documented purposes, appropriate notices/consent, access controls, retention/deletion and incident handling for the applicable dates and roles. Confirm controller/processor responsibilities and contractual requirements. [MeitY Gazette](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).

## Product priorities

1. Finish current security/financial/storage gates; implement and test an operational restore procedure before relying on the system of record.
2. Make one collection journey excellent: today's list → search customer → record amount → local committed pending state → matching server acknowledgement → receipt → cash handover → verified close.
3. Offer assisted imports with reconciliation of opening balances and sample borrower statements. Never silently infer old principal/interest allocation from a combined amount.
4. Complete the pilot language, including errors, receipts and help; test on inexpensive Android phones and poor networks.
5. Consider externally paid digital repayment recording, with verified references and reconciliation, only after workflow discovery. This does not require becoming a payment gateway or holding funds; do not broaden the original scope without a separate implementation decision.
6. Keep owner/admin access on the web. Validate the field journey before choosing a native agent app; build native only where measured device/offline requirements justify it. Defer Electron and broad module expansion.

## Commercial model to test

Do not assume free hosting makes the business free to operate. Paid delivery, storage/photos, backups, security maintenance, support, onboarding and customer acquisition determine sustainability. Define limits and export/exit terms honestly.

Test an organization subscription around ₹999–₹1,999/month for teams, with a clear included agent/branch limit and optional assisted onboarding. This is a proposed experiment, not market-proven willingness to pay. The low advertised competitor price makes a premium credible only if operational savings and service quality are demonstrated.

Illustrative arithmetic, not a forecast: 100 organizations at ₹1,499/month yield ₹149,900 monthly gross subscription revenue before taxes, discounts, churn and all costs. At ₹1,000/year, 100 organizations yield about ₹8,333 monthly equivalent revenue. Track actual support minutes, onboarding effort and acquisition costs before setting permanent prices. Do not count the industry's loan portfolio as potential software revenue.

## Validation plan and decision gates

Begin discovery while engineering gates are completed. Conduct 10 owner/manager interviews, 10 agent observations and 5 borrower/accountant conversations across 3–5 candidate organizations. This is a practical qualitative sample, not statistically representative of India. Do not contact anyone automatically; this document proposes the work.

Ask for recent examples and observe the current workflow: time to record a payment, time to close the day, mismatches/disputes, existing software cost, failed imports, phone/language constraints and who approves a purchase. Use redacted or synthetic records until an appropriate pilot data agreement and production controls exist. Test prospects' existing methods and competing products rather than lead them with “would you like our app?”.

Run a 30–60 day controlled pilot with 3 legally eligible organizations and roughly 5–10 agents after release-critical gates. Start in parallel with existing records; compare every opening balance and day's totals. Confirm exports, restore, permission revocation and offline recovery before switching primary records. Invite independent accountant review.

| Proposed gate | Success criterion |
|---|---|
| Correctness | No lost/duplicate acknowledged payments; every monetary mismatch investigated; agreed rounding rules reconcile exactly |
| Daily use | At least 80% of participating agents use it on working days by week four |
| Field speed | Median payment recording under 20 seconds after locating the account; compare with baseline |
| Office value | At least 30% reduction in measured end-of-day reconciliation time |
| Usability | Agents complete the core tasks with minimal intervention after training; failures/recovery are understood |
| Payment | At least two of three pilot organizations pay the quoted price for a subsequent period |
| Retention | Paying teams still use the core workflow after the initial novelty and intensive onboarding support |
| Safety | Successful restore, no cross-organization exposure, documented incident/recovery procedure |

These are proposed business thresholds, not observed results or universal industry benchmarks. Payment and continued use are stronger evidence than compliments or registrations. Track why organizations decline, switch away or need support.

Continue investment if the pilot produces accurate records, habitual agent use, measurable office savings and paying renewals. Simplify or change the segment if users still duplicate everything without benefit or refuse a sustainable price. Stop expansion if the desired demand is actually savings/chit/accounting functionality the product does not cover, or legally impermissible lending. User love cannot be inferred from test counts; it must appear in daily reliance and voluntary renewal.
