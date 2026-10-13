import Decimal from 'decimal.js';

export type InterestType = 'flat' | 'reducing_balance';
export type CollectionFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type TenurePeriod = 'days' | 'weeks' | 'months';

export interface EMICalculationParams {
  principal: number;
  interestRate: number; // annual rate
  tenure: number;
  tenurePeriod: TenurePeriod;
  collectionFrequency: CollectionFrequency;
  interestType: InterestType;
}

export interface EMIScheduleItem {
  installmentNumber: number;
  principal: number;
  interest: number;
  total: number;
  balance: number;
}

export interface EMICalculationResult {
  totalPayable: number;
  totalInterest: number;
  emi: number;
  schedule: EMIScheduleItem[];
}

export function calculateEMI(params: EMICalculationParams): EMICalculationResult {
  const empty = { totalPayable: 0, totalInterest: 0, emi: 0, schedule: [] };
  const { principal, interestRate, tenure, tenurePeriod, collectionFrequency, interestType } = params;
  if (!Number.isFinite(principal) || principal <= 0 || principal > 9999999999.99 ||
      !Number.isFinite(interestRate) || interestRate < 0 || interestRate > 999.999 ||
      !Number.isInteger(tenure) || tenure < 1 ||
      !new Decimal(principal).equals(new Decimal(principal).toDecimalPlaces(2)) ||
      !['flat', 'reducing_balance'].includes(interestType)) return empty;
  const periods = { daily: 365, weekly: 52, biweekly: 26, monthly: 12 }[collectionFrequency];
  if (!periods) return empty;
  const days = { days: 1, weeks: 7, months: 30 }[tenurePeriod];
  const periodDays = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }[collectionFrequency];
  if (!days) return empty;
  const installments = Math.ceil(tenure * days / periodDays);
  if (installments < 1 || installments > 10000) return empty;
  const principalCents = new Decimal(principal).mul(100).toNumber();
  const rate = new Decimal(interestRate).div(100).div(periods);
  const flatInterest = new Decimal(principal).mul(interestRate).mul(installments).div(100).div(periods).toDecimalPlaces(2).mul(100).toNumber();
  const emi = rate.isZero() ? new Decimal(principal).div(installments)
    : new Decimal(principal).mul(rate).div(new Decimal(1).minus(rate.plus(1).pow(-installments)));
  const emiCents = emi.toDecimalPlaces(2).mul(100).toNumber();
  const share = (cents: number, index: number) => Math.floor(cents / installments) + (index < cents % installments ? 1 : 0);
  let balance = principalCents;
  let interestSum = 0;
  const schedule: EMIScheduleItem[] = [];
  for (let index = 0; index < installments; index++) {
    const interest = interestType === 'flat' ? share(flatInterest, index)
      : new Decimal(balance).mul(rate).toDecimalPlaces(0).toNumber();
    const principalPart = interestType === 'flat' ? share(principalCents, index)
      : index === installments - 1 ? balance : Math.min(balance, Math.max(0, emiCents - interest));
    balance -= principalPart;
    interestSum += interest;
    if (principalPart + interest > 999999999999) return empty;
    schedule.push({ installmentNumber: index + 1, principal: principalPart / 100,
      interest: interest / 100, total: (principalPart + interest) / 100, balance: balance / 100 });
  }
  if (principalCents + interestSum > 999999999999) return empty;
  return { totalPayable: (principalCents + interestSum) / 100, totalInterest: interestSum / 100,
    emi: schedule[0].total, schedule };
}
