import { Prisma, ScheduleStatus } from '@prisma/client';
import { calculatePreClosure } from '../../modules/loans/utils/pre-closure.util';
import { assertLoanMatchesOriginalTerms } from '../../modules/loans/utils/original-terms.util';

type Money = string | Prisma.Decimal;
export type ScheduleEvidence = {
  id: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  principalComponent: Money;
  interestComponent: Money;
  dueAmount: Money;
  paidAmount: Money;
  paidPrincipal: Money | null;
  paidInterest: Money | null;
  paidFees: Money | null;
  status: string;
};
export type PaymentEvidence = {
  id: string;
  organizationId: string;
  loanId: string;
  customerId: string;
  collectorOrganizationId: string;
  customerOrganizationId: string;
  amount: Money;
  status: string;
  collectionDate: string;
  collectedAt: string;
  recordedAt?: string;
  reversedAt?: string | null;
  allocationDetails: unknown;
};
export type AmendmentEvidence = {
  organizationId: string;
  loanId: string;
  version: number;
  operation: string;
  createdAt: string;
  beforeEvidence: unknown;
  afterEvidence: unknown;
};
export type FinancialEvidence = {
  id: string;
  organizationId: string;
  customerId: string;
  customerOrganizationId: string;
  productOrganizationId: string;
  status: string;
  startDate: string | null;
  principalAmount: Money;
  interestRateAnnual: Money;
  interestType: string;
  collectionFrequency: string;
  tenure: number;
  totalPayable: Money;
  totalCollected: Money;
  outstandingBalance: Money;
  financialTerms: Prisma.JsonValue | null;
  schedule: ScheduleEvidence[];
  payments: PaymentEvidence[];
  amendments: AmendmentEvidence[];
};

type Components = {
  principal: Prisma.Decimal;
  interest: Prisma.Decimal;
  fees: Prisma.Decimal;
};
type ParsedRow = ReturnType<typeof parseRow>;
const zero = () => new Prisma.Decimal(0);
const empty = (): Components => ({
  principal: zero(),
  interest: zero(),
  fees: zero(),
});
const sum = (part: Components) =>
  part.principal.plus(part.interest).plus(part.fees);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid evidence');
  return value as Record<string, unknown>;
};
const identifier = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('invalid identifier');
  return value;
};
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error('invalid installment');
  return value;
};
function money(value: unknown, rate = false): Prisma.Decimal {
  if (
    !(value instanceof Prisma.Decimal) &&
    (typeof value !== 'string' ||
      !(rate ? /^\d+(?:\.\d{1,3})?$/ : /^\d+(?:\.\d{1,2})?$/).test(value))
  )
    throw new Error('invalid money');
  const parsed = new Prisma.Decimal(value);
  if (
    !parsed.isFinite() ||
    parsed.lt(0) ||
    parsed.gt(rate ? '999.999' : '9999999999.99') ||
    parsed.decimalPlaces() > (rate ? 3 : 2)
  )
    throw new Error('invalid money');
  return parsed;
}
function date(value: unknown, timestamp = false): Date {
  if (
    typeof value !== 'string' ||
    !(
      timestamp
        ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
        : /^\d{4}-\d{2}-\d{2}$/
    ).test(value)
  )
    throw new Error('invalid date');
  const parsed = new Date(timestamp ? value : `${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value.slice(0, 10)
  )
    throw new Error('invalid date');
  return parsed;
}
function components(value: Record<string, unknown>): Components {
  return {
    principal: money(value.principal),
    interest: money(value.interest),
    fees: money(value.fees),
  };
}
function parseRow(input: ScheduleEvidence) {
  const principalComponent = money(input.principalComponent);
  const interestComponent = money(input.interestComponent);
  const dueAmount = money(input.dueAmount);
  const paidAmount = money(input.paidAmount);
  const paidValues = [input.paidPrincipal, input.paidInterest, input.paidFees];
  const paid = paidValues.every((value) => value === null)
    ? paidAmount.isZero()
      ? empty()
      : null
    : {
        principal: money(input.paidPrincipal),
        interest: money(input.paidInterest),
        fees: money(input.paidFees),
      };
  if (
    dueAmount.lt(principalComponent.plus(interestComponent)) ||
    paidAmount.gt(dueAmount) ||
    !['pending', 'partially_paid', 'overdue', 'paid', 'waived'].includes(
      input.status,
    ) ||
    (input.status === 'paid' && !paidAmount.equals(dueAmount)) ||
    (paid &&
      (!sum(paid).equals(paidAmount) ||
        paid.principal.gt(principalComponent) ||
        paid.interest.gt(interestComponent) ||
        paid.fees.gt(
          dueAmount.minus(principalComponent).minus(interestComponent),
        )))
  )
    throw new Error('invalid schedule');
  return {
    id: identifier(input.id),
    loanId: identifier(input.loanId),
    installmentNumber: integer(input.installmentNumber),
    dueDate: date(input.dueDate),
    principalComponent,
    interestComponent,
    dueAmount,
    paidAmount,
    paidPrincipal: paid?.principal ?? null,
    paidInterest: paid?.interest ?? null,
    paidFees: paid?.fees ?? null,
    paid,
    status: input.status as ScheduleStatus,
  };
}
function snapshotRows(value: unknown, loanId: string, closure = false) {
  if (!Array.isArray(value) || !value.length)
    throw new Error('invalid schedule snapshot');
  return value.map((entry) => {
    const row = object(entry);
    return parseRow({
      id: identifier(closure ? row.scheduleId : row.id),
      loanId,
      installmentNumber: integer(row.installmentNumber),
      dueDate: row.dueDate as string,
      principalComponent: (closure
        ? row.principal
        : row.principalComponent) as Money,
      interestComponent: (closure
        ? row.interest
        : row.interestComponent) as Money,
      dueAmount: row.dueAmount as Money,
      paidAmount: row.paidAmount as Money,
      paidPrincipal: row.paidPrincipal as Money | null,
      paidInterest: row.paidInterest as Money | null,
      paidFees: row.paidFees as Money | null,
      status: row.status as string,
    });
  });
}

/** Read-only evidence comparison. Missing facts never become assumed components. */
export function reconcileFinancialEvidence(input: FinancialEvidence) {
  const missing = new Set<string>();
  const inconsistent = new Set<string>();
  const mark = (code: string) => inconsistent.add(code);
  let paymentTotal = zero();
  let regularTotal = zero();
  let settlementTotal = zero();
  let regularComponents = empty();
  let settlementComponents = empty();
  const allocations = new Map<string, Components>();
  const rows = new Map<string, ParsedRow>();
  const archived = new Map<string, ParsedRow>();
  let unknownActiveAllocations = false;
  let totalPayable: Prisma.Decimal;
  let totalCollected: Prisma.Decimal;
  let outstanding: Prisma.Decimal;
  let principalAmount = zero();
  let startDate: Date | null = null;
  try {
    identifier(input.id);
    identifier(input.organizationId);
    identifier(input.customerId);
    if (
      ![
        'pending_approval',
        'approved',
        'rejected',
        'active',
        'closed',
        'defaulted',
        'written_off',
      ].includes(input.status)
    )
      throw new Error('invalid loan status');
    if (
      input.customerOrganizationId !== input.organizationId ||
      input.productOrganizationId !== input.organizationId
    )
      mark('loan_association_mismatch');
    totalPayable = money(input.totalPayable);
    totalCollected = money(input.totalCollected);
    outstanding = money(input.outstandingBalance);
    if (!totalPayable.minus(totalCollected).equals(outstanding))
      mark('loan_arithmetic_mismatch');
    principalAmount = money(input.principalAmount);
    const interestRateAnnual = money(input.interestRateAnnual, true);
    if (principalAmount.isZero()) throw new Error('invalid principal');
    integer(input.tenure);
    if (input.startDate !== null) startDate = date(input.startDate);
    if (input.financialTerms === null)
      missing.add('historical_contract_missing');
    else {
      assertLoanMatchesOriginalTerms({
        ...input,
        principalAmount,
        interestRateAnnual,
      });
      const terms = object(input.financialTerms);
      if (!input.amendments.length && terms.originalTenure !== input.tenure)
        missing.add('amendment_tenure_evidence_missing');
    }
  } catch {
    mark('invalid_loan_or_contract');
    totalPayable = zero();
    totalCollected = zero();
    outstanding = zero();
  }
  const installments = new Set<number>();
  for (const rowInput of input.schedule) {
    try {
      const row = parseRow(rowInput);
      if (
        row.loanId !== input.id ||
        rows.has(row.id) ||
        installments.has(row.installmentNumber)
      )
        throw new Error('invalid association');
      rows.set(row.id, row);
      installments.add(row.installmentNumber);
      if (!row.paid) missing.add('historical_paid_components_missing');
      if (
        input.financialTerms !== null &&
        !row.dueAmount.equals(
          row.principalComponent.plus(row.interestComponent),
        )
      )
        mark('known_contract_schedule_fee_mismatch');
    } catch {
      mark('invalid_schedule');
    }
  }
  const ordered = [...rows.values()].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );
  if (
    ordered.some(
      (row, index) =>
        row.installmentNumber !== index + 1 ||
        (startDate && row.dueDate < startDate) ||
        (index > 0 && row.dueDate <= ordered[index - 1].dueDate),
    )
  )
    mark('schedule_order_mismatch');
  const amendments = [...input.amendments].sort(
    (a, b) => a.version - b.version,
  );
  const parsedAmendments: {
    version: number;
    from: number;
    beforePayable: Prisma.Decimal;
    beforeOutstanding: Prisma.Decimal;
    afterPayable: Prisma.Decimal;
    afterOutstanding: Prisma.Decimal;
    retired: ParsedRow[];
    replacement: ParsedRow[];
  }[] = [];
  for (const [index, amendment] of amendments.entries()) {
    try {
      if (
        amendment.loanId !== input.id ||
        amendment.organizationId !== input.organizationId ||
        amendment.version !== index + 1 ||
        amendment.operation !== 'restructure'
      )
        throw new Error('invalid amendment');
      // PostgreSQL now() is transaction start, not lock acquisition or commit.
      // Consecutive locked versions establish order; timestamps only validate.
      date(amendment.createdAt, true);
      const before = object(amendment.beforeEvidence);
      const after = object(amendment.afterEvidence);
      if (before.evidenceVersion !== 1 || after.evidenceVersion !== 1)
        throw new Error('invalid version');
      const retired = snapshotRows(before.replacedSchedule, input.id);
      const replacement = snapshotRows(after.replacementSchedule, input.id);
      const from = integer(after.fromInstallmentNumber);
      const beforePayable = money(before.totalPayable);
      const beforeOutstanding = money(before.outstandingBalance);
      const afterPayable = money(after.newTotalPayable);
      const afterOutstanding = money(after.newOutstandingBalance);
      if (
        beforeOutstanding.gt(beforePayable) ||
        afterOutstanding.gt(afterPayable) ||
        after.borrowerAcceptance !== 'not_recorded' ||
        integer(after.newTenure) !== replacement.length ||
        integer(after.totalTenure) !== from - 1 + replacement.length ||
        (index === amendments.length - 1 &&
          after.totalTenure !== input.tenure) ||
        !validSuffix(retired, from) ||
        !validSuffix(replacement, from) ||
        retired.some((row) => !row.paidAmount.isZero()) ||
        replacement.some((row) => !row.paidAmount.isZero()) ||
        [...retired, ...replacement].some(
          (row) => row.status === 'paid' || row.status === 'waived',
        ) ||
        retired[0].installmentNumber !== from ||
        replacement[0].installmentNumber !== from ||
        !money(before.totalPayable)
          .minus(retired.reduce((acc, row) => acc.plus(row.dueAmount), zero()))
          .plus(
            replacement.reduce((acc, row) => acc.plus(row.dueAmount), zero()),
          )
          .equals(money(after.newTotalPayable)) ||
        !money(before.outstandingBalance)
          .minus(retired.reduce((acc, row) => acc.plus(row.dueAmount), zero()))
          .plus(
            replacement.reduce((acc, row) => acc.plus(row.dueAmount), zero()),
          )
          .equals(money(after.newOutstandingBalance)) ||
        !retired
          .reduce((acc, row) => acc.plus(row.principalComponent), zero())
          .equals(
            replacement.reduce(
              (acc, row) => acc.plus(row.principalComponent),
              zero(),
            ),
          )
      )
        throw new Error('invalid amendment totals');
      parsedAmendments.push({
        version: amendment.version,
        from,
        beforePayable,
        beforeOutstanding,
        afterPayable,
        afterOutstanding,
        retired,
        replacement,
      });
      for (const row of retired) {
        if (archived.has(row.id) || rows.has(row.id))
          throw new Error('invalid retired identity');
        archived.set(row.id, row);
      }
      for (const row of replacement) {
        const current = rows.get(row.id);
        // A later amendment can retire an earlier replacement; checked below.
        if (current && !sameCharges(current, row))
          throw new Error('replacement changed');
      }
    } catch {
      mark('amendment_evidence_mismatch');
    }
  }
  for (const amendment of amendments) {
    try {
      for (const row of snapshotRows(
        object(amendment.afterEvidence).replacementSchedule,
        input.id,
      )) {
        const retained = rows.get(row.id) ?? archived.get(row.id);
        if (!retained) mark('amendment_schedule_identity_missing');
        else if (!sameCharges(row, retained))
          mark('amendment_evidence_mismatch');
      }
    } catch {
      mark('amendment_evidence_mismatch');
    }
  }
  const ids = new Set<string>();
  const settlements: {
    evidence: Record<string, unknown>;
    amount: Prisma.Decimal;
    collectedAt: Date;
  }[] = [];
  for (const payment of input.payments) {
    let active = false;
    try {
      if (
        ids.has(identifier(payment.id)) ||
        payment.loanId !== input.id ||
        payment.organizationId !== input.organizationId ||
        payment.customerId !== input.customerId ||
        payment.customerOrganizationId !== input.organizationId ||
        payment.collectorOrganizationId !== input.organizationId ||
        !['recorded', 'verified', 'disputed', 'reversed'].includes(
          payment.status,
        )
      )
        throw new Error('invalid payment association');
      ids.add(payment.id);
      date(payment.collectionDate);
      const collectedAt = date(payment.collectedAt, true);
      if (payment.recordedAt !== undefined) date(payment.recordedAt, true);
      if (payment.reversedAt !== undefined && payment.reversedAt !== null)
        date(payment.reversedAt, true);
      const amount = money(payment.amount);
      if (amount.isZero()) throw new Error('zero payment');
      active = payment.status === 'recorded' || payment.status === 'verified';
      if (active) paymentTotal = paymentTotal.plus(amount);
      if (payment.allocationDetails === null) {
        missing.add('historical_payment_allocation_missing');
        unknownActiveAllocations ||= active;
        continue;
      }
      const evidence = object(payment.allocationDetails);
      if (evidence.version !== 1) throw new Error('invalid allocation version');
      if (evidence.type === 'early_closure') {
        if (!active) throw new Error('reversed settlement unsupported');
        if (evidence.componentVersion !== 1 || evidence.rows !== undefined)
          throw new Error('invalid settlement version');
        settlements.push({ evidence, amount, collectedAt });
        settlementTotal = settlementTotal.plus(amount);
        const part = components(evidence);
        const penalty = money(evidence.penalty);
        if (!sum(part).plus(penalty).equals(amount))
          throw new Error('settlement sum mismatch');
        settlementComponents = add(settlementComponents, part);
        continue;
      }
      if (evidence.type !== undefined)
        throw new Error('unknown allocation type');
      if (!Array.isArray(evidence.rows) || !evidence.rows.length)
        throw new Error('invalid allocation rows');
      if (evidence.componentVersion === undefined) {
        // Old row-only v1 amounts remain useful cash evidence, not a paid split.
        missing.add('historical_payment_components_missing');
        unknownActiveAllocations ||= active;
      } else if (evidence.componentVersion !== 1)
        throw new Error('invalid component version');
      let allocated = zero();
      const targets = new Set<string>();
      for (const entry of evidence.rows) {
        const allocation = object(entry);
        const id = identifier(allocation.scheduleId);
        const row = rows.get(id) ?? archived.get(id);
        const applied = money(allocation.amount);
        if (targets.has(id) || applied.isZero())
          throw new Error('invalid allocation target');
        if (!row) {
          if (active && evidence.componentVersion === 1)
            throw new Error('invalid current allocation target');
          missing.add('historical_allocation_schedule_missing');
          unknownActiveAllocations ||= active;
        }
        targets.add(id);
        if (active && row && !rows.has(id))
          throw new Error('active payment on retired schedule');
        allocated = allocated.plus(applied);
        if (evidence.componentVersion !== 1) continue;
        const part = components(allocation);
        if (
          !sum(part).equals(applied) ||
          (row &&
            (part.principal.gt(row.principalComponent) ||
              part.interest.gt(row.interestComponent) ||
              part.fees.gt(
                row.dueAmount
                  .minus(row.principalComponent)
                  .minus(row.interestComponent),
              )))
        )
          throw new Error('invalid component allocation');
        if (active) {
          allocations.set(id, add(allocations.get(id) ?? empty(), part));
          regularComponents = add(regularComponents, part);
        }
      }
      if (!allocated.equals(amount)) throw new Error('allocation sum mismatch');
      if (active) regularTotal = regularTotal.plus(amount);
    } catch {
      mark('invalid_payment_or_allocation');
      unknownActiveAllocations ||= active;
    }
  }
  if (!paymentTotal.equals(totalCollected)) mark('collection_total_mismatch');
  for (const row of rows.values()) {
    const reconstructed = allocations.get(row.id) ?? empty();
    if (sum(reconstructed).gt(row.paidAmount))
      mark('schedule_paid_amount_mismatch');
    if (row.paid) {
      if (
        unknownActiveAllocations
          ? reconstructed.principal.gt(row.paid.principal) ||
            reconstructed.interest.gt(row.paid.interest) ||
            reconstructed.fees.gt(row.paid.fees)
          : !equal(reconstructed, row.paid)
      )
        mark('schedule_paid_components_mismatch');
    }
    if (!unknownActiveAllocations && !sum(reconstructed).equals(row.paidAmount))
      mark('schedule_paid_amount_mismatch');
  }
  const scheduledOutstanding = ordered.reduce(
    (acc, row) =>
      row.status === 'waived'
        ? acc
        : acc.plus(row.dueAmount).minus(row.paidAmount),
    zero(),
  );
  const completeSchedule = rows.size === input.schedule.length;
  if (['active', 'defaulted', 'closed'].includes(input.status)) {
    if (!ordered.length) mark('repayment_schedule_missing');
    if (completeSchedule && !scheduledOutstanding.equals(outstanding))
      mark('schedule_outstanding_mismatch');
    if (
      completeSchedule &&
      !ordered
        .reduce((acc, row) => acc.plus(row.principalComponent), zero())
        .equals(principalAmount)
    )
      mark('scheduled_principal_mismatch');
  }
  if (settlements.length > 1) mark('multiple_active_settlements');
  let waived = zero();
  const verifiedSettlements = new Set<Record<string, unknown>>();
  for (const settlement of settlements) {
    try {
      if (
        date(settlement.evidence.settledAt, true).getTime() !==
        settlement.collectedAt.getTime()
      )
        throw new Error('settlement timestamp mismatch');
      const source = snapshotRows(
        settlement.evidence.sourceSchedule,
        input.id,
        true,
      );
      if (
        source.length !== rows.size ||
        input.status !== 'closed' ||
        !input.startDate
      )
        throw new Error('invalid settlement state');
      const sourceIds = new Set<string>();
      for (const row of source) {
        const current = rows.get(row.id);
        if (
          !current ||
          sourceIds.has(row.id) ||
          !sameCharges(current, row) ||
          !row.paid ||
          !current.paid ||
          !equal(current.paid, row.paid) ||
          !current.paidAmount.equals(row.paidAmount) ||
          (row.status === 'paid'
            ? current.status !== 'paid'
            : current.status !== 'waived')
        )
          throw new Error('invalid settlement snapshot');
        sourceIds.add(row.id);
      }
      const quote = calculatePreClosure(
        source,
        date(input.startDate),
        date(settlement.evidence.settledAt, true),
      );
      const quotePart = {
        principal: new Prisma.Decimal(quote.outstandingPrincipal),
        interest: new Prisma.Decimal(quote.accruedInterest),
        fees: new Prisma.Decimal(quote.lateFees),
      };
      const savedWaiver = money(settlement.evidence.waivedAmount);
      if (
        !equal(quotePart, components(settlement.evidence)) ||
        !new Prisma.Decimal(quote.preClosureAmount).equals(settlement.amount) ||
        !money(settlement.evidence.penalty).equals(quote.preClosurePenalty) ||
        !savedWaiver.equals(quote.amountSaved)
      )
        throw new Error('settlement quote mismatch');
      waived = waived.plus(savedWaiver);
      verifiedSettlements.add(settlement.evidence);
    } catch {
      mark('settlement_evidence_mismatch');
    }
  }
  const unexplainedWaivers =
    ordered.some((row) => row.status === 'waived') && !settlements.length;
  if (unexplainedWaivers) missing.add('waiver_settlement_evidence_missing');
  if (
    ordered.length &&
    completeSchedule &&
    !unexplainedWaivers &&
    !ordered
      .reduce((acc, row) => acc.plus(row.dueAmount), zero())
      .minus(waived)
      .equals(totalPayable)
  )
    mark('schedule_payable_mismatch');
  if (parsedAmendments.length && completeSchedule) {
    const createdVersion = new Map<string, number>();
    const retiredVersion = new Map<string, number>();
    for (const amendment of parsedAmendments) {
      for (const row of amendment.replacement)
        createdVersion.set(row.id, amendment.version);
      for (const row of amendment.retired)
        retiredVersion.set(row.id, amendment.version);
    }
    for (const [index, amendment] of parsedAmendments.entries()) {
      if (
        index > 0 &&
        !parsedAmendments[index - 1].afterPayable.equals(
          amendment.beforePayable,
        )
      )
        mark('amendment_payable_chain_mismatch');
    }
    const latest = parsedAmendments[parsedAmendments.length - 1];
    if (
      !unexplainedWaivers &&
      !latest.afterPayable.equals(totalPayable.plus(waived))
    )
      mark('amendment_current_payable_mismatch');
    let historicalSchedule = new Map(rows);
    for (const amendment of [...parsedAmendments].reverse()) {
      const suffix = [...historicalSchedule.values()]
        .filter((row) => row.installmentNumber >= amendment.from)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);
      if (
        suffix.length !== amendment.replacement.length ||
        suffix.some(
          (row, index) =>
            row.id !== amendment.replacement[index].id ||
            !sameCharges(row, amendment.replacement[index]),
        )
      ) {
        mark('amendment_schedule_snapshot_mismatch');
        break;
      }
      const afterDue = [...historicalSchedule.values()].reduce(
        (acc, row) => acc.plus(row.dueAmount),
        zero(),
      );
      historicalSchedule = new Map(
        [...historicalSchedule.values()]
          .filter((row) => row.installmentNumber < amendment.from)
          .concat(amendment.retired)
          .map((row) => [row.id, row]),
      );
      const beforeDue = [...historicalSchedule.values()].reduce(
        (acc, row) => acc.plus(row.dueAmount),
        zero(),
      );
      if (
        !beforeDue.equals(amendment.beforePayable) ||
        !afterDue.equals(amendment.afterPayable)
      )
        mark('amendment_absolute_payable_mismatch');
      // Retained rows have no durable payment order relative to amendment
      // capture. Transaction-start timestamps cannot establish that order.
      // Created/retired identities can instead prove a receipt's net-zero effect.
      const allReceiptsProvablyZero = input.payments.every((payment) => {
        try {
          const evidence = object(payment.allocationDetails);
          if (verifiedSettlements.has(evidence)) return true;
          if (!Array.isArray(evidence.rows) || !evidence.rows.length)
            return false;
          const targets = evidence.rows.map((entry) =>
            identifier(object(entry).scheduleId),
          );
          const created = Math.max(
            0,
            ...targets.map((id) => createdVersion.get(id) ?? 0),
          );
          const retired = Math.min(
            Infinity,
            ...targets.map((id) => retiredVersion.get(id) ?? Infinity),
          );
          // Posting follows the creation of every allocated target. A whole
          // reversal must precede retirement of any target captured unpaid.
          return (
            created >= amendment.version ||
            (payment.status === 'reversed' && retired <= amendment.version)
          );
        } catch {
          return false;
        }
      });
      if (!allReceiptsProvablyZero)
        missing.add('amendment_payment_timeline_unproven');
      else if (
        !amendment.beforeOutstanding.equals(beforeDue) ||
        !amendment.afterOutstanding.equals(afterDue)
      )
        mark('amendment_absolute_outstanding_mismatch');
    }
  }
  return {
    state: inconsistent.size
      ? 'inconsistent'
      : missing.size
        ? 'incomplete'
        : 'consistent',
    missing: [...missing].sort(),
    inconsistent: [...inconsistent].sort(),
    reconstructed: {
      paymentTotal: paymentTotal.toFixed(2),
      regularTotal: regularTotal.toFixed(2),
      settlementTotal: settlementTotal.toFixed(2),
      regularComponents: serialize(regularComponents),
      settlementComponents: serialize(settlementComponents),
      componentTotalsComplete:
        !unknownActiveAllocations && inconsistent.size === 0,
    },
  };
}
function add(a: Components, b: Components): Components {
  return {
    principal: a.principal.plus(b.principal),
    interest: a.interest.plus(b.interest),
    fees: a.fees.plus(b.fees),
  };
}
function equal(a: Components, b: Components) {
  return (
    a.principal.equals(b.principal) &&
    a.interest.equals(b.interest) &&
    a.fees.equals(b.fees)
  );
}
function sameCharges(a: ParsedRow, b: ParsedRow) {
  return (
    a.installmentNumber === b.installmentNumber &&
    a.dueDate.getTime() === b.dueDate.getTime() &&
    a.principalComponent.equals(b.principalComponent) &&
    a.interestComponent.equals(b.interestComponent) &&
    a.dueAmount.equals(b.dueAmount)
  );
}
function validSuffix(rows: ParsedRow[], from: number) {
  const ids = new Set<string>();
  return rows.every((row, index) => {
    const valid =
      !ids.has(row.id) &&
      row.installmentNumber === from + index &&
      (index === 0 || row.dueDate > rows[index - 1].dueDate);
    ids.add(row.id);
    return valid;
  });
}
function serialize(part: Components) {
  return {
    principal: part.principal.toFixed(2),
    interest: part.interest.toFixed(2),
    fees: part.fees.toFixed(2),
  };
}
