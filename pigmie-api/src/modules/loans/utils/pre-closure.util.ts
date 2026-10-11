import { BadRequestException } from '@nestjs/common';
import { Prisma, LoanSchedule } from '@prisma/client';
import { businessDate } from './date.util';

type Row = Pick<
  LoanSchedule,
  | 'installmentNumber'
  | 'dueDate'
  | 'principalComponent'
  | 'interestComponent'
  | 'dueAmount'
  | 'paidAmount'
  | 'status'
>;

/** Combined payments are allocated proportionally because no component ledger exists. */
export function calculatePreClosure(
  schedule: Row[],
  startDate: Date | null,
  now = new Date(),
) {
  if (!startDate || schedule.length === 0)
    throw new BadRequestException('A valid repayment schedule is required');
  const today = businessDate(now);
  const ordered = [...schedule].sort(
    (a, b) => a.installmentNumber - b.installmentNumber,
  );
  const current = ordered.find((row) => row.dueDate > today);
  let principal = new Prisma.Decimal(0);
  let interest = new Prisma.Decimal(0);
  let fees = new Prisma.Decimal(0);
  let scheduled = new Prisma.Decimal(0);
  for (const row of ordered) {
    if (row.status === 'paid' || row.status === 'waived') continue;
    const base = row.principalComponent.plus(row.interestComponent);
    if (
      row.principalComponent.lt(0) ||
      row.interestComponent.lt(0) ||
      row.paidAmount.lt(0) ||
      row.dueAmount.lt(base) ||
      row.paidAmount.gt(row.dueAmount)
    ) {
      throw new BadRequestException(
        'Schedule requires reconciliation before early closure',
      );
    }
    const remaining = row.dueAmount.minus(row.paidAmount);
    if (remaining.isZero()) continue;
    const ratio = remaining.div(row.dueAmount);
    const unpaidPrincipal = row.principalComponent
      .mul(ratio)
      .toDecimalPlaces(2);
    const unpaidInterest = Prisma.Decimal.min(
      remaining.minus(unpaidPrincipal),
      row.interestComponent.mul(ratio).toDecimalPlaces(2),
    );
    principal = principal.plus(unpaidPrincipal);
    fees = fees.plus(remaining.minus(unpaidPrincipal).minus(unpaidInterest));
    scheduled = scheduled.plus(remaining);
    if (row.dueDate <= today) interest = interest.plus(unpaidInterest);
    else if (row === current) {
      const previous = ordered.find(
        (item) => item.installmentNumber === row.installmentNumber - 1,
      );
      const periodStart = previous?.dueDate ?? startDate;
      const duration = row.dueDate.getTime() - periodStart.getTime();
      if (duration <= 0)
        throw new BadRequestException('Schedule dates require reconciliation');
      const elapsed = Math.min(
        duration,
        Math.max(0, today.getTime() - periodStart.getTime()),
      );
      interest = interest.plus(
        unpaidInterest.mul(elapsed).div(duration).toDecimalPlaces(2),
      );
    }
  }
  // No product penalty field exists: never invent an additional charge.
  const payoff = principal.plus(interest).plus(fees);
  return {
    outstandingPrincipal: principal.toNumber(),
    accruedInterest: interest.toNumber(),
    lateFees: fees.toNumber(),
    preClosurePenalty: 0,
    penaltyRate: 0,
    preClosureAmount: payoff.toNumber(),
    amountSaved: scheduled.minus(payoff).toNumber(),
  };
}
