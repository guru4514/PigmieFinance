import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  periodsPerYear,
  calculateFlatInterest,
  calculateReducingBalanceEMI,
  validateTerms,
  Frequency,
} from './interest.util';
import { addPeriods } from './date.util';

export interface ScheduleRow {
  installmentNumber: number;
  dueDate: string;
  principalComponent: number;
  interestComponent: number;
  dueAmount: number;
}

export interface GenerateScheduleParams {
  principal: number;
  interestType: 'flat' | 'reducing_balance';
  annualRate: number;
  tenure: number;
  frequency: Frequency;
  startDate: string;
}

export function generateSchedule(
  params: GenerateScheduleParams,
): ScheduleRow[] {
  const { principal, interestType, annualRate, tenure, frequency, startDate } =
    params;
  validateTerms(principal, annualRate, tenure, frequency);
  if (interestType !== 'flat' && interestType !== 'reducing_balance') {
    throw new BadRequestException('Unsupported interest type');
  }
  addPeriods(startDate, 0, frequency);
  const principalCents = new Prisma.Decimal(principal).mul(100).toNumber();
  const schedule: ScheduleRow[] = [];
  const interestCents =
    interestType === 'flat'
      ? new Prisma.Decimal(
          calculateFlatInterest(principal, annualRate, tenure, frequency)
            .totalInterest,
        )
          .mul(100)
          .toNumber()
      : 0;
  const emiCents =
    interestType === 'reducing_balance'
      ? new Prisma.Decimal(
          calculateReducingBalanceEMI(principal, annualRate, tenure, frequency),
        )
          .mul(100)
          .toNumber()
      : 0;
  const rate = new Prisma.Decimal(annualRate)
    .div(100)
    .div(periodsPerYear(frequency));
  let balance = principalCents;
  // Distribute remainder cents across rows; never defer an over-allocation to a negative final row.
  const share = (cents: number, index: number) =>
    Math.floor(cents / tenure) + (index < cents % tenure ? 1 : 0);
  for (let index = 0; index < tenure; index++) {
    const interest =
      interestType === 'flat'
        ? share(interestCents, index)
        : new Prisma.Decimal(balance).mul(rate).toDecimalPlaces(0).toNumber();
    const paidPrincipal =
      interestType === 'flat'
        ? share(principalCents, index)
        : index === tenure - 1
          ? balance
          : Math.min(balance, Math.max(0, emiCents - interest));
    balance -= paidPrincipal;
    if (paidPrincipal + interest > 999999999999)
      throw new BadRequestException('Installment exceeds the supported amount');
    schedule.push({
      installmentNumber: index + 1,
      dueDate: addPeriods(startDate, index + 1, frequency),
      principalComponent: paidPrincipal / 100,
      interestComponent: interest / 100,
      dueAmount: (paidPrincipal + interest) / 100,
    });
  }
  if (
    schedule.reduce((sum, row) => sum + Math.round(row.dueAmount * 100), 0) >
    999999999999
  ) {
    throw new BadRequestException('Loan total exceeds the supported amount');
  }
  return schedule;
}
