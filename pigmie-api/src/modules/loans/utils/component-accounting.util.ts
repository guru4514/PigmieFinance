import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type ComponentRow = {
  principalComponent: Prisma.Decimal;
  interestComponent: Prisma.Decimal;
  dueAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  paidPrincipal?: Prisma.Decimal | null;
  paidInterest?: Prisma.Decimal | null;
  paidFees?: Prisma.Decimal | null;
};

export function paidComponents(row: ComponentRow) {
  if (
    [
      row.principalComponent,
      row.interestComponent,
      row.dueAmount,
      row.paidAmount,
    ].some((value) => !value.isFinite())
  ) {
    throw new BadRequestException('Paid components require reconciliation');
  }
  const values = [row.paidPrincipal, row.paidInterest, row.paidFees];
  if (values.every((value) => value === null || value === undefined)) {
    if (!row.paidAmount.isZero()) {
      throw new BadRequestException(
        'Historical paid components require source reconciliation',
      );
    }
    return {
      principal: new Prisma.Decimal(0),
      interest: new Prisma.Decimal(0),
      fees: new Prisma.Decimal(0),
    };
  }
  const [principal, interest, fees] = values;
  if (
    !principal ||
    !interest ||
    !fees ||
    !principal.isFinite() ||
    !interest.isFinite() ||
    !fees.isFinite() ||
    principal.lt(0) ||
    interest.lt(0) ||
    fees.lt(0) ||
    principal.gt(row.principalComponent) ||
    interest.gt(row.interestComponent) ||
    fees.gt(
      row.dueAmount.minus(row.principalComponent).minus(row.interestComponent),
    ) ||
    !principal.plus(interest).plus(fees).equals(row.paidAmount)
  ) {
    throw new BadRequestException('Paid components require reconciliation');
  }
  return { principal, interest, fees };
}

/** Record exact components once; reversal must reuse this evidence. */
export function allocateComponents(row: ComponentRow, amount: Prisma.Decimal) {
  const paid = paidComponents(row);
  const remaining = {
    principal: row.principalComponent.minus(paid.principal),
    interest: row.interestComponent.minus(paid.interest),
    fees: row.dueAmount
      .minus(row.principalComponent)
      .minus(row.interestComponent)
      .minus(paid.fees),
  };
  const total = remaining.principal
    .plus(remaining.interest)
    .plus(remaining.fees);
  if (
    Object.values(remaining).some((value) => value.lt(0)) ||
    !amount.isFinite() ||
    amount.lte(0) ||
    amount.gt(total) ||
    !amount.equals(amount.toDecimalPlaces(2))
  ) {
    throw new BadRequestException('Payment components require reconciliation');
  }
  let principal = Prisma.Decimal.min(
    remaining.principal,
    amount.mul(remaining.principal).div(total).toDecimalPlaces(2),
  );
  let interest = Prisma.Decimal.min(
    remaining.interest,
    amount.minus(principal),
    amount.mul(remaining.interest).div(total).toDecimalPlaces(2),
  );
  const fees = Prisma.Decimal.min(
    remaining.fees,
    amount.minus(principal).minus(interest),
  );
  let residual = amount.minus(principal).minus(interest).minus(fees);
  const extraInterest = Prisma.Decimal.min(
    residual,
    remaining.interest.minus(interest),
  );
  interest = interest.plus(extraInterest);
  residual = residual.minus(extraInterest);
  const extraPrincipal = Prisma.Decimal.min(
    residual,
    remaining.principal.minus(principal),
  );
  principal = principal.plus(extraPrincipal);
  residual = residual.minus(extraPrincipal);
  if (!residual.isZero())
    throw new BadRequestException('Component rounding could not reconcile');
  return { principal, interest, fees };
}
