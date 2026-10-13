import { BadRequestException } from '@nestjs/common';
import { Prisma, LoanSchedule } from '@prisma/client';
import { businessDate } from './date.util';
import { paidComponents } from './component-accounting.util';

type Row = Pick<
  LoanSchedule,
  | 'installmentNumber'
  | 'dueDate'
  | 'principalComponent'
  | 'interestComponent'
  | 'dueAmount'
  | 'paidAmount'
  | 'status'
> &
  Partial<Pick<LoanSchedule, 'paidPrincipal' | 'paidInterest' | 'paidFees'>>;

/** Use recorded components; never guess an already-paid historical split. */
export function calculatePreClosure(
  schedule: Row[],
  startDate: Date | null,
  now = new Date(),
) {
  if (
    !startDate ||
    !Number.isFinite(startDate.getTime()) ||
    !Number.isFinite(now.getTime()) ||
    schedule.length === 0
  )
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
  for (const [index, row] of ordered.entries()) {
    const base = row.principalComponent.plus(row.interestComponent);
    if (
      row.installmentNumber !== index + 1 ||
      [
        row.principalComponent,
        row.interestComponent,
        row.dueAmount,
        row.paidAmount,
      ].some((value) => !value.isFinite()) ||
      !Number.isFinite(row.dueDate.getTime()) ||
      row.dueDate < startDate ||
      (index > 0 && row.dueDate <= ordered[index - 1].dueDate) ||
      row.principalComponent.lt(0) ||
      row.interestComponent.lt(0) ||
      row.paidAmount.lt(0) ||
      row.dueAmount.lt(base) ||
      row.paidAmount.gt(row.dueAmount) ||
      (row.status === 'paid' && !row.paidAmount.equals(row.dueAmount))
    ) {
      throw new BadRequestException(
        'Schedule requires reconciliation before early closure',
      );
    }
    if (row.status === 'waived') continue;
    const paid = paidComponents(row);
    if (row.status === 'paid') continue;
    const remaining = row.dueAmount.minus(row.paidAmount);
    if (remaining.isZero()) continue;
    const unpaidPrincipal = row.principalComponent.minus(paid.principal);
    const unpaidInterest = row.interestComponent.minus(paid.interest);
    principal = principal.plus(unpaidPrincipal);
    fees = fees.plus(row.dueAmount.minus(base).minus(paid.fees));
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
        Prisma.Decimal.max(
          0,
          row.interestComponent
            .mul(elapsed)
            .div(duration)
            .toDecimalPlaces(2)
            .minus(paid.interest),
        ),
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
