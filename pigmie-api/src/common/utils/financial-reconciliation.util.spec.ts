import { Prisma } from '@prisma/client';
import {
  FinancialEvidence,
  reconcileFinancialEvidence,
} from './financial-reconciliation.util';

const fixture = (): FinancialEvidence => ({
  id: 'loan',
  organizationId: 'org',
  customerId: 'customer',
  customerOrganizationId: 'org',
  productOrganizationId: 'org',
  status: 'active',
  startDate: '2026-01-01',
  principalAmount: '100.00',
  interestRateAnnual: '12.000',
  interestType: 'flat',
  collectionFrequency: 'monthly',
  tenure: 1,
  totalPayable: '110.00',
  totalCollected: '55.00',
  outstandingBalance: '55.00',
  financialTerms: {
    version: 1,
    currency: 'INR',
    businessTimezone: 'Asia/Kolkata',
    originalPrincipal: '100.00',
    originalTenure: 1,
    interestRateAnnual: '12.000',
    interestType: 'flat',
    collectionFrequency: 'monthly',
    paymentAllocation: 'oldest_installment_proportional_components_v1',
    earlyClosure: 'unpaid_principal_daily_accrued_interest_v1',
    lateFee: '0.00',
    processingFee: '0.00',
    preClosurePenalty: '0.00',
    rounding: 'INR_two_decimal_half_up',
  },
  schedule: [
    {
      id: 'schedule',
      loanId: 'loan',
      installmentNumber: 1,
      dueDate: '2026-01-31',
      principalComponent: '100.00',
      interestComponent: '10.00',
      dueAmount: '110.00',
      paidAmount: '55.00',
      paidPrincipal: '50.00',
      paidInterest: '5.00',
      paidFees: '0.00',
      status: 'partially_paid',
    },
  ],
  payments: [
    {
      id: 'payment',
      organizationId: 'org',
      loanId: 'loan',
      customerId: 'customer',
      collectorOrganizationId: 'org',
      customerOrganizationId: 'org',
      amount: '55.00',
      status: 'recorded',
      collectionDate: '2026-01-15',
      collectedAt: '2026-01-15T06:00:00.000Z',
      allocationDetails: {
        version: 1,
        componentVersion: 1,
        rows: [
          {
            scheduleId: 'schedule',
            amount: '55.00',
            principal: '50.00',
            interest: '5.00',
            fees: '0.00',
          },
        ],
      },
    },
  ],
  amendments: [],
});

const allocation = (loan: FinancialEvidence) =>
  loan.payments[0].allocationDetails as {
    version: number;
    componentVersion?: number;
    rows: Record<string, unknown>[];
  };
function closureFixture(): FinancialEvidence {
  const loan = fixture();
  loan.status = 'closed';
  loan.totalPayable = '105.00';
  loan.totalCollected = '105.00';
  loan.outstandingBalance = '0.00';
  loan.schedule[0].status = 'waived';
  loan.payments.push({
    ...loan.payments[0],
    id: 'settlement',
    amount: '50.00',
    collectionDate: '2026-01-16',
    collectedAt: '2026-01-16T06:00:00.000Z',
    allocationDetails: {
      version: 1,
      componentVersion: 1,
      type: 'early_closure',
      principal: '50.00',
      interest: '0.00',
      fees: '0.00',
      penalty: '0.00',
      waivedAmount: '5.00',
      settledAt: '2026-01-16T06:00:00.000Z',
      sourceSchedule: [
        {
          scheduleId: 'schedule',
          installmentNumber: 1,
          dueDate: '2026-01-31',
          principal: '100.00',
          interest: '10.00',
          dueAmount: '110.00',
          paidAmount: '55.00',
          paidPrincipal: '50.00',
          paidInterest: '5.00',
          paidFees: '0.00',
          status: 'partially_paid',
        },
      ],
    },
  });
  return loan;
}
function amendedFixture(): FinancialEvidence {
  const loan = fixture();
  loan.payments = [];
  loan.totalCollected = '0.00';
  loan.totalPayable = '112.00';
  loan.outstandingBalance = '112.00';
  loan.schedule[0] = {
    ...loan.schedule[0],
    id: 'replacement',
    dueDate: '2026-02-01',
    interestComponent: '12.00',
    dueAmount: '112.00',
    paidAmount: '0.00',
    paidPrincipal: '0.00',
    paidInterest: '0.00',
    paidFees: '0.00',
    status: 'pending',
  };
  const beforeRow = {
    ...loan.schedule[0],
    id: 'original',
    dueDate: '2026-01-31',
    interestComponent: '10.00',
    dueAmount: '110.00',
  };
  loan.amendments.push({
    organizationId: 'org',
    loanId: 'loan',
    version: 1,
    operation: 'restructure',
    createdAt: '2026-01-20T06:00:00.000Z',
    beforeEvidence: {
      evidenceVersion: 1,
      totalPayable: '110.00',
      outstandingBalance: '110.00',
      replacedSchedule: [beforeRow],
    },
    afterEvidence: {
      evidenceVersion: 1,
      borrowerAcceptance: 'not_recorded',
      fromInstallmentNumber: 1,
      newTenure: 1,
      totalTenure: 1,
      newTotalPayable: '112.00',
      newOutstandingBalance: '112.00',
      replacementSchedule: [{ ...loan.schedule[0] }],
    },
  });
  return loan;
}

function twoAmendmentsFixture(): FinancialEvidence {
  const loan = amendedFixture();
  const previous = { ...loan.schedule[0] };
  loan.schedule[0] = {
    ...previous,
    id: 'replacement-two',
    dueDate: '2026-03-01',
    interestComponent: '15.00',
    dueAmount: '115.00',
  };
  loan.totalPayable = '115.00';
  loan.outstandingBalance = '115.00';
  loan.amendments.push({
    ...loan.amendments[0],
    version: 2,
    createdAt: '2026-01-21T06:00:00.000Z',
    beforeEvidence: {
      evidenceVersion: 1,
      totalPayable: '112.00',
      outstandingBalance: '112.00',
      replacedSchedule: [previous],
    },
    afterEvidence: {
      evidenceVersion: 1,
      borrowerAcceptance: 'not_recorded',
      fromInstallmentNumber: 1,
      newTenure: 1,
      totalTenure: 1,
      newTotalPayable: '115.00',
      newOutstandingBalance: '115.00',
      replacementSchedule: [{ ...loan.schedule[0] }],
    },
  });
  return loan;
}
function amendedClosureFixture(): FinancialEvidence {
  const loan = amendedFixture();
  loan.status = 'closed';
  loan.totalPayable = '105.81';
  loan.totalCollected = '105.81';
  loan.outstandingBalance = '0.00';
  loan.schedule[0].status = 'waived';
  loan.payments = [
    {
      ...fixture().payments[0],
      id: 'settlement',
      amount: '105.81',
      collectionDate: '2026-01-16',
      collectedAt: '2026-01-16T06:00:00.000Z',
      allocationDetails: {
        version: 1,
        componentVersion: 1,
        type: 'early_closure',
        principal: '100.00',
        interest: '5.81',
        fees: '0.00',
        penalty: '0.00',
        waivedAmount: '6.19',
        settledAt: '2026-01-16T06:00:00.000Z',
        sourceSchedule: [
          {
            scheduleId: 'replacement',
            installmentNumber: 1,
            dueDate: '2026-02-01',
            principal: '100.00',
            interest: '12.00',
            dueAmount: '112.00',
            paidAmount: '0.00',
            paidPrincipal: '0.00',
            paidInterest: '0.00',
            paidFees: '0.00',
            status: 'pending',
          },
        ],
      },
    },
  ];
  return loan;
}
function retainedPaymentFixture(): FinancialEvidence {
  const loan = amendedFixture();
  loan.tenure = 2;
  (loan.financialTerms as Prisma.JsonObject).originalTenure = 2;
  loan.totalCollected = '22.00';
  loan.outstandingBalance = '90.00';
  const prefix = {
    ...loan.schedule[0],
    id: 'retained',
    installmentNumber: 1,
    dueDate: '2026-01-16',
    principalComponent: '50.00',
    interestComponent: '5.00',
    dueAmount: '55.00',
    paidAmount: '22.00',
    paidPrincipal: '20.00',
    paidInterest: '2.00',
    paidFees: '0.00',
    status: 'partially_paid',
  };
  const replacement = {
    ...loan.schedule[0],
    installmentNumber: 2,
    principalComponent: '50.00',
    interestComponent: '7.00',
    dueAmount: '57.00',
  };
  loan.schedule = [prefix, replacement];
  loan.amendments[0].beforeEvidence = {
    evidenceVersion: 1,
    totalPayable: '110.00',
    outstandingBalance: '88.00',
    replacedSchedule: [
      {
        ...replacement,
        id: 'original',
        dueDate: '2026-01-31',
        interestComponent: '5.00',
        dueAmount: '55.00',
      },
    ],
  };
  loan.amendments[0].afterEvidence = {
    evidenceVersion: 1,
    borrowerAcceptance: 'not_recorded',
    fromInstallmentNumber: 2,
    newTenure: 1,
    totalTenure: 2,
    newTotalPayable: '112.00',
    newOutstandingBalance: '90.00',
    replacementSchedule: [{ ...replacement }],
  };
  loan.payments = [
    {
      ...fixture().payments[0],
      amount: '22.00',
      recordedAt: '2026-01-15T06:00:00.000Z',
      allocationDetails: {
        version: 1,
        componentVersion: 1,
        rows: [
          {
            scheduleId: 'retained',
            amount: '22.00',
            principal: '20.00',
            interest: '2.00',
            fees: '0.00',
          },
        ],
      },
    },
  ];
  return loan;
}

function offsetPayable(loan: FinancialEvidence, index: number, amount = 100) {
  const before = loan.amendments[index].beforeEvidence as Record<
    string,
    unknown
  >;
  const after = loan.amendments[index].afterEvidence as Record<string, unknown>;
  before.totalPayable = new Prisma.Decimal(before.totalPayable as string)
    .plus(amount)
    .toFixed(2);
  after.newTotalPayable = new Prisma.Decimal(after.newTotalPayable as string)
    .plus(amount)
    .toFixed(2);
}

describe('independent financial evidence reconciliation', () => {
  it('reconstructs exact regular totals from both recorded and verified payments', () => {
    for (const status of ['recorded', 'verified']) {
      const loan = fixture();
      loan.payments[0].status = status;
      expect(reconcileFinancialEvidence(loan)).toMatchObject({
        state: 'consistent',
        missing: [],
        inconsistent: [],
        reconstructed: {
          paymentTotal: '55.00',
          regularTotal: '55.00',
          regularComponents: {
            principal: '50.00',
            interest: '5.00',
            fees: '0.00',
          },
          componentTotalsComplete: true,
        },
      });
    }
  });

  it('excludes reversed and disputed payments rather than subtracting twice', () => {
    const loan = fixture();
    for (const status of ['reversed', 'disputed'])
      loan.payments.push({
        ...loan.payments[0],
        id: status,
        status,
        amount: '11.00',
        allocationDetails: {
          version: 1,
          componentVersion: 1,
          rows: [
            {
              scheduleId: 'schedule',
              amount: '11.00',
              principal: '10.00',
              interest: '1.00',
              fees: '0.00',
            },
          ],
        },
      });
    expect(reconcileFinancialEvidence(loan).reconstructed.paymentTotal).toBe(
      '55.00',
    );
    expect(reconcileFinancialEvidence(loan).state).toBe('consistent');
  });

  it('detects disagreeing component splits even when all combined totals balance', () => {
    const loan = fixture();
    loan.schedule[0].paidPrincipal = '49.00';
    loan.schedule[0].paidInterest = '6.00';
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'schedule_paid_components_mismatch',
    );
  });

  it('preserves historical unknowns as missing evidence without guessing a split', () => {
    const loan = fixture();
    loan.financialTerms = null;
    loan.payments[0].allocationDetails = null;
    loan.schedule[0].paidPrincipal = null;
    loan.schedule[0].paidInterest = null;
    loan.schedule[0].paidFees = null;
    expect(reconcileFinancialEvidence(loan)).toMatchObject({
      state: 'incomplete',
      inconsistent: [],
      missing: [
        'historical_contract_missing',
        'historical_paid_components_missing',
        'historical_payment_allocation_missing',
      ],
      reconstructed: { componentTotalsComplete: false },
    });
  });

  it('uses old row-only allocation totals but does not label its components verified', () => {
    const loan = fixture();
    delete allocation(loan).componentVersion;
    expect(reconcileFinancialEvidence(loan)).toMatchObject({
      state: 'incomplete',
      inconsistent: [],
      reconstructed: { regularTotal: '55.00', componentTotalsComplete: false },
    });
  });

  it('still detects a known allocation exceeding a component amid unknown payments', () => {
    const loan = fixture();
    loan.payments.push({
      ...loan.payments[0],
      id: 'historical',
      amount: '1.00',
      allocationDetails: null,
    });
    loan.totalCollected = '56.00';
    loan.outstandingBalance = '54.00';
    allocation(loan).rows[0].principal = '51.00';
    allocation(loan).rows[0].interest = '4.00';
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'schedule_paid_components_mismatch',
    );
  });

  it('rejects malformed mixed versions, duplicate allocations, subpaise and nonfinite money', () => {
    for (const change of [
      (loan: FinancialEvidence) => {
        allocation(loan).componentVersion = 2;
      },
      (loan: FinancialEvidence) => {
        allocation(loan).rows.push({ ...allocation(loan).rows[0] });
      },
      (loan: FinancialEvidence) => {
        allocation(loan).rows[0].principal = '50.001';
      },
      (loan: FinancialEvidence) => {
        allocation(loan).rows[0].principal = 'NaN';
      },
      (loan: FinancialEvidence) => {
        allocation(loan).rows[0].principal = new Prisma.Decimal(Infinity);
      },
      (loan: FinancialEvidence) => {
        allocation(loan).rows[0].interest = null;
      },
      (loan: FinancialEvidence) => {
        allocation(loan).rows[0].scheduleId = 'different-loan-row';
      },
    ]) {
      const loan = fixture();
      change(loan);
      expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
        'invalid_payment_or_allocation',
      );
    }
  });

  it('rejects invalid dates and cross-tenant payment associations without throwing data', () => {
    for (const change of [
      (loan: FinancialEvidence) => {
        loan.payments[0].collectionDate = '2026-02-30';
      },
      (loan: FinancialEvidence) => {
        loan.payments[0].collectedAt = 'not-a-date';
      },
      (loan: FinancialEvidence) => {
        loan.payments[0].collectorOrganizationId = 'other';
      },
      (loan: FinancialEvidence) => {
        loan.payments[0].customerId = 'other';
      },
    ]) {
      const loan = fixture();
      change(loan);
      expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
        'invalid_payment_or_allocation',
      );
    }
    const loan = fixture();
    loan.startDate = '2026-02-30';
    expect(() => reconcileFinancialEvidence(loan)).not.toThrow();
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'invalid_loan_or_contract',
    );
  });

  it('rejects nonfinite and out-of-column amounts/rates even without historical terms', () => {
    for (const change of [
      (loan: FinancialEvidence) => {
        loan.principalAmount = '10000000000.00';
      },
      (loan: FinancialEvidence) => {
        loan.interestRateAnnual = 'NaN';
      },
      (loan: FinancialEvidence) => {
        loan.interestRateAnnual = '1000.000';
      },
      (loan: FinancialEvidence) => {
        loan.totalPayable = new Prisma.Decimal(Infinity);
      },
    ]) {
      const loan = fixture();
      loan.financialTerms = null;
      change(loan);
      expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
        'invalid_loan_or_contract',
      );
    }
  });

  it('reconstructs an early closure separately and verifies its captured source schedule', () => {
    expect(reconcileFinancialEvidence(closureFixture())).toMatchObject({
      state: 'consistent',
      missing: [],
      inconsistent: [],
      reconstructed: {
        regularTotal: '55.00',
        settlementTotal: '50.00',
        settlementComponents: {
          principal: '50.00',
          interest: '0.00',
          fees: '0.00',
        },
      },
    });
  });

  it('detects settlement component/date/waiver tampering even if loan arithmetic balances', () => {
    for (const change of [
      (evidence: Record<string, unknown>) => {
        evidence.principal = '49.00';
        evidence.interest = '1.00';
      },
      (evidence: Record<string, unknown>) => {
        evidence.waivedAmount = '4.00';
      },
      (evidence: Record<string, unknown>) => {
        evidence.settledAt = '2026-02-30T06:00:00.000Z';
      },
      (evidence: Record<string, unknown>) => {
        (
          evidence.sourceSchedule as Record<string, unknown>[]
        )[0].paidPrincipal = '49.00';
        (evidence.sourceSchedule as Record<string, unknown>[])[0].paidInterest =
          '6.00';
      },
    ]) {
      const loan = closureFixture();
      change(loan.payments[1].allocationDetails as Record<string, unknown>);
      expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
        'settlement_evidence_mismatch',
      );
    }
  });

  it('rejects multiple active settlements and unsupported settlement reversals', () => {
    const loan = closureFixture();
    loan.payments.push({ ...loan.payments[1], id: 'duplicate-settlement' });
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'multiple_active_settlements',
    );
    const reversed = closureFixture();
    reversed.payments[1].status = 'reversed';
    expect(reconcileFinancialEvidence(reversed).inconsistent).toContain(
      'invalid_payment_or_allocation',
    );
  });

  it('recognizes durable amendment replacements and validates monetary deltas', () => {
    expect(reconcileFinancialEvidence(amendedFixture()).state).toBe(
      'consistent',
    );
    const loan = amendedFixture();
    (
      loan.amendments[0].afterEvidence as Record<string, unknown>
    ).newTotalPayable = '113.00';
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'amendment_evidence_mismatch',
    );
  });

  it('rejects equally offset before/after payable snapshots whose local delta still balances', () => {
    const loan = amendedFixture();
    offsetPayable(loan, 0);
    const result = reconcileFinancialEvidence(loan);
    expect(result.inconsistent).toContain(
      'amendment_absolute_payable_mismatch',
    );
    expect(result.inconsistent).toContain('amendment_current_payable_mismatch');
  });

  it('rejects outstanding offsets within payable bounds when receipts prove no historical cash', () => {
    const loan = amendedFixture();
    (
      loan.amendments[0].beforeEvidence as Record<string, unknown>
    ).outstandingBalance = '100.00';
    (
      loan.amendments[0].afterEvidence as Record<string, unknown>
    ).newOutstandingBalance = '102.00';
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'amendment_absolute_outstanding_mismatch',
    );
  });

  it('anchors every version rather than accepting an offset initial capture with a valid final version', () => {
    const loan = twoAmendmentsFixture();
    offsetPayable(loan, 0);
    const result = reconcileFinancialEvidence(loan);
    expect(result.inconsistent).toContain('amendment_payable_chain_mismatch');
    expect(result.inconsistent).toContain(
      'amendment_absolute_payable_mismatch',
    );
    expect(result.inconsistent).not.toContain(
      'amendment_current_payable_mismatch',
    );
    const allOffset = twoAmendmentsFixture();
    offsetPayable(allOffset, 0);
    offsetPayable(allOffset, 1);
    expect(reconcileFinancialEvidence(allOffset).inconsistent).toContain(
      'amendment_current_payable_mismatch',
    );
  });

  it('anchors the latest pre-settlement payable through the verified final waiver', () => {
    expect(reconcileFinancialEvidence(amendedClosureFixture()).state).toBe(
      'consistent',
    );
    const loan = amendedClosureFixture();
    offsetPayable(loan, 0);
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'amendment_current_payable_mismatch',
    );
    const corruptWaiver = amendedClosureFixture();
    (
      corruptWaiver.payments[0].allocationDetails as Record<string, unknown>
    ).waivedAmount = '106.19';
    offsetPayable(corruptWaiver, 0);
    expect(reconcileFinancialEvidence(corruptWaiver).inconsistent).toContain(
      'settlement_evidence_mismatch',
    );
    expect(reconcileFinancialEvidence(corruptWaiver).inconsistent).toContain(
      'amendment_current_payable_mismatch',
    );
  });

  it('does not invent a missing settlement waiver to compare the current payable anchor', () => {
    const loan = amendedClosureFixture();
    loan.payments[0].allocationDetails = null;
    const result = reconcileFinancialEvidence(loan);
    expect(result.state).toBe('incomplete');
    expect(result.inconsistent).toEqual([]);
    expect(result.missing).toContain('waiver_settlement_evidence_missing');
  });

  it('uses causal versions despite equal or inverted transaction-start timestamps', () => {
    for (const timestamp of [
      '2026-01-20T06:00:00.000Z',
      '2026-01-19T06:00:00.000Z',
    ]) {
      const loan = twoAmendmentsFixture();
      loan.amendments[1].createdAt = timestamp;
      expect(reconcileFinancialEvidence(loan).state).toBe('consistent');
    }
  });

  it('proves a payment on a newly created replacement followed capture despite an older posting timestamp', () => {
    const loan = amendedFixture();
    loan.totalCollected = '22.00';
    loan.outstandingBalance = '90.00';
    loan.schedule[0].paidAmount = '22.00';
    loan.schedule[0].paidPrincipal = '19.64';
    loan.schedule[0].paidInterest = '2.36';
    loan.schedule[0].status = 'partially_paid';
    loan.payments = [
      {
        ...fixture().payments[0],
        amount: '22.00',
        recordedAt: '2026-01-19T06:00:00.000Z',
        allocationDetails: {
          version: 1,
          componentVersion: 1,
          rows: [
            {
              scheduleId: 'replacement',
              amount: '22.00',
              principal: '19.64',
              interest: '2.36',
              fees: '0.00',
            },
          ],
        },
      },
    ];
    expect(reconcileFinancialEvidence(loan).state).toBe('consistent');
  });

  it('classifies retained-row payment ordering as incomplete without creating false outstanding contradictions', () => {
    for (const timestamp of [
      '2026-01-15T06:00:00.000Z',
      '2026-01-20T06:00:00.000Z',
      '2026-01-21T06:00:00.000Z',
    ]) {
      const loan = retainedPaymentFixture();
      loan.payments[0].recordedAt = timestamp;
      const result = reconcileFinancialEvidence(loan);
      expect(result.state).toBe('incomplete');
      expect(result.inconsistent).toEqual([]);
      expect(result.missing).toContain('amendment_payment_timeline_unproven');
    }
  });

  it('does not infer a retained-row reversal occurred before capture from its current status', () => {
    for (const reversedAt of [
      null,
      '2026-01-19T06:00:00.000Z',
      '2026-01-21T06:00:00.000Z',
    ]) {
      const loan = retainedPaymentFixture();
      loan.payments[0].status = 'reversed';
      loan.payments[0].reversedAt = reversedAt;
      loan.totalCollected = '0.00';
      loan.outstandingBalance = '112.00';
      loan.schedule[0].paidAmount = '0.00';
      loan.schedule[0].paidPrincipal = '0.00';
      loan.schedule[0].paidInterest = '0.00';
      loan.schedule[0].status = 'pending';
      const result = reconcileFinancialEvidence(loan);
      expect(result.state).toBe('incomplete');
      expect(result.inconsistent).toEqual([]);
      expect(result.missing).toContain('amendment_payment_timeline_unproven');
    }
  });

  it('verifies a two-amendment identity chain including previously retired replacements', () => {
    const loan = amendedFixture();
    const previous = { ...loan.schedule[0] };
    loan.schedule[0] = {
      ...previous,
      id: 'replacement-two',
      dueDate: '2026-03-01',
      interestComponent: '15.00',
      dueAmount: '115.00',
    };
    loan.totalPayable = '115.00';
    loan.outstandingBalance = '115.00';
    loan.amendments.push({
      ...loan.amendments[0],
      version: 2,
      createdAt: '2026-01-21T06:00:00.000Z',
      beforeEvidence: {
        evidenceVersion: 1,
        totalPayable: '112.00',
        outstandingBalance: '112.00',
        replacedSchedule: [previous],
      },
      afterEvidence: {
        evidenceVersion: 1,
        borrowerAcceptance: 'not_recorded',
        fromInstallmentNumber: 1,
        newTenure: 1,
        totalTenure: 1,
        newTotalPayable: '115.00',
        newOutstandingBalance: '115.00',
        replacementSchedule: [{ ...loan.schedule[0] }],
      },
    });
    expect(reconcileFinancialEvidence(loan).state).toBe('consistent');
    const archived = (
      loan.amendments[1].beforeEvidence as {
        replacedSchedule: Record<string, unknown>[];
      }
    ).replacedSchedule[0];
    archived.dueDate = '2026-02-02';
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'amendment_evidence_mismatch',
    );
  });

  it('accounts recorded fees without treating historical terms as a zero-fee contract', () => {
    const loan = fixture();
    loan.financialTerms = null;
    loan.totalPayable = '120.00';
    loan.totalCollected = '60.00';
    loan.outstandingBalance = '60.00';
    loan.schedule[0].dueAmount = '120.00';
    loan.schedule[0].paidAmount = '60.00';
    loan.schedule[0].paidFees = '5.00';
    loan.payments[0].amount = '60.00';
    allocation(loan).rows[0].amount = '60.00';
    allocation(loan).rows[0].fees = '5.00';
    expect(reconcileFinancialEvidence(loan)).toMatchObject({
      state: 'incomplete',
      inconsistent: [],
      reconstructed: {
        regularComponents: {
          principal: '50.00',
          interest: '5.00',
          fees: '5.00',
        },
      },
    });
  });

  it('does not fabricate aggregate mismatches from an incomplete malformed schedule projection', () => {
    const loan = fixture();
    loan.schedule[0].principalComponent = '-1.00';
    const result = reconcileFinancialEvidence(loan);
    expect(result.inconsistent).toContain('invalid_schedule');
    expect(result.inconsistent).not.toContain('schedule_payable_mismatch');
    expect(result.inconsistent).not.toContain('scheduled_principal_mismatch');
  });

  it('retains reversed allocation identity across amendments and rejects active retired allocations', () => {
    const loan = amendedFixture();
    const oldPayment = fixture().payments[0];
    oldPayment.id = 'old';
    oldPayment.status = 'reversed';
    (
      oldPayment.allocationDetails as { rows: Record<string, unknown>[] }
    ).rows[0].scheduleId = 'original';
    loan.payments.push(oldPayment);
    expect(reconcileFinancialEvidence(loan).state).toBe('consistent');
    oldPayment.status = 'recorded';
    expect(reconcileFinancialEvidence(loan).inconsistent).toContain(
      'invalid_payment_or_allocation',
    );
  });

  it('classifies a retired reversed row without old amendment history as missing source evidence', () => {
    const loan = fixture();
    const reversed = {
      ...loan.payments[0],
      id: 'old-reversed',
      status: 'reversed',
      allocationDetails: {
        version: 1,
        componentVersion: 1,
        rows: [
          {
            scheduleId: 'historically-replaced',
            amount: '55.00',
            principal: '50.00',
            interest: '5.00',
            fees: '0.00',
          },
        ],
      },
    };
    loan.payments.push(reversed);
    expect(reconcileFinancialEvidence(loan)).toMatchObject({
      state: 'incomplete',
      inconsistent: [],
      missing: ['historical_allocation_schedule_missing'],
    });
  });

  it('detects skipped amendment versions, changed replacement charges and lost schedule identities', () => {
    for (const change of [
      (loan: FinancialEvidence) => {
        loan.amendments[0].version = 2;
      },
      (loan: FinancialEvidence) => {
        loan.schedule[0].interestComponent = '13.00';
        loan.schedule[0].dueAmount = '113.00';
      },
      (loan: FinancialEvidence) => {
        loan.schedule[0].id = 'unrecorded-replacement';
      },
    ]) {
      const loan = amendedFixture();
      change(loan);
      expect(reconcileFinancialEvidence(loan).state).toBe('inconsistent');
    }
  });

  it('does not claim an old waiver is reconstructable without settlement evidence', () => {
    const loan = closureFixture();
    loan.financialTerms = null;
    loan.payments[1].allocationDetails = null;
    expect(reconcileFinancialEvidence(loan)).toMatchObject({
      state: 'incomplete',
      inconsistent: [],
    });
    expect(reconcileFinancialEvidence(loan).missing).toContain(
      'waiver_settlement_evidence_missing',
    );
  });
});
