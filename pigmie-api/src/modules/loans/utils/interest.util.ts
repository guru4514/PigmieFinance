import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export function periodsPerYear(frequency: Frequency): number {
  switch (frequency) {
    case 'daily':
      return 365;
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'monthly':
      return 12;
    default:
      throw new BadRequestException('Unsupported collection frequency');
  }
}

export function validateTerms(
  principal: number,
  annualRate: number,
  tenure: number,
  frequency: Frequency,
) {
  periodsPerYear(frequency);
  if (
    !Number.isFinite(principal) ||
    principal <= 0 ||
    principal > 9999999999.99 ||
    !new Prisma.Decimal(principal).equals(
      new Prisma.Decimal(principal).toDecimalPlaces(2),
    )
  ) {
    throw new BadRequestException(
      'Principal must be a positive amount with at most two decimal places',
    );
  }
  if (!Number.isFinite(annualRate) || annualRate < 0 || annualRate > 999.999) {
    throw new BadRequestException('Annual rate must be between 0 and 999.999');
  }
  if (!Number.isInteger(tenure) || tenure < 1 || tenure > 10000) {
    throw new BadRequestException(
      'Tenure must be between 1 and 10000 installments',
    );
  }
}

export function calculateFlatInterest(
  principal: number,
  annualRate: number,
  tenure: number,
  frequency: Frequency,
) {
  validateTerms(principal, annualRate, tenure, frequency);
  const totalInterest = new Prisma.Decimal(principal)
    .mul(annualRate)
    .mul(tenure)
    .div(100)
    .div(periodsPerYear(frequency))
    .toDecimalPlaces(2);
  const totalPayable = new Prisma.Decimal(principal).plus(totalInterest);
  return {
    totalInterest: totalInterest.toNumber(),
    totalPayable: totalPayable.toNumber(),
    installmentAmount: totalPayable.div(tenure).toDecimalPlaces(2).toNumber(),
  };
}

export function calculateReducingBalanceEMI(
  principal: number,
  annualRate: number,
  tenure: number,
  frequency: Frequency,
): number {
  validateTerms(principal, annualRate, tenure, frequency);
  const rate = new Prisma.Decimal(annualRate)
    .div(100)
    .div(periodsPerYear(frequency));
  if (rate.isZero())
    return new Prisma.Decimal(principal)
      .div(tenure)
      .toDecimalPlaces(2)
      .toNumber();
  // Negative exponent avoids overflow for long terms/high rates.
  return new Prisma.Decimal(principal)
    .mul(rate)
    .div(new Prisma.Decimal(1).minus(rate.plus(1).pow(-tenure)))
    .toDecimalPlaces(2)
    .toNumber();
}
