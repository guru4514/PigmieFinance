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
  const { principal, interestRate, tenure, tenurePeriod, collectionFrequency, interestType } = params;
  
  if (principal <= 0 || interestRate <= 0 || tenure <= 0) {
    return { totalPayable: 0, totalInterest: 0, emi: 0, schedule: [] };
  }

  // Calculate total tenure in days for flat interest approximation
  let tenureInYears = 0;
  if (tenurePeriod === 'days') tenureInYears = tenure / 365;
  else if (tenurePeriod === 'weeks') tenureInYears = tenure / 52;
  else if (tenurePeriod === 'months') tenureInYears = tenure / 12;

  // Determine number of installments based on collection frequency and total duration
  let installments = 0;
  if (tenurePeriod === 'days') {
      if (collectionFrequency === 'daily') installments = tenure;
      else if (collectionFrequency === 'weekly') installments = Math.ceil(tenure / 7);
      else if (collectionFrequency === 'biweekly') installments = Math.ceil(tenure / 14);
      else if (collectionFrequency === 'monthly') installments = Math.ceil(tenure / 30);
  } else if (tenurePeriod === 'weeks') {
      if (collectionFrequency === 'daily') installments = tenure * 7;
      else if (collectionFrequency === 'weekly') installments = tenure;
      else if (collectionFrequency === 'biweekly') installments = Math.ceil(tenure / 2);
      else if (collectionFrequency === 'monthly') installments = Math.ceil((tenure * 7) / 30);
  } else if (tenurePeriod === 'months') {
      if (collectionFrequency === 'daily') installments = tenure * 30;
      else if (collectionFrequency === 'weekly') installments = Math.ceil((tenure * 30) / 7);
      else if (collectionFrequency === 'biweekly') installments = Math.ceil((tenure * 30) / 14);
      else if (collectionFrequency === 'monthly') installments = tenure;
  }

  if (installments <= 0) {
    return { totalPayable: 0, totalInterest: 0, emi: 0, schedule: [] };
  }

  const schedule: EMIScheduleItem[] = [];

  if (interestType === 'flat') {
    const totalInterest = principal * (interestRate / 100) * tenureInYears;
    const totalPayable = principal + totalInterest;
    const emi = totalPayable / installments;
    
    let balance = principal;
    const principalPerEmi = principal / installments;
    const interestPerEmi = totalInterest / installments;

    for (let i = 1; i <= installments; i++) {
      balance = Math.max(0, balance - principalPerEmi);
      schedule.push({
        installmentNumber: i,
        principal: principalPerEmi,
        interest: interestPerEmi,
        total: emi,
        balance: balance
      });
    }

    return { totalPayable, totalInterest, emi, schedule };
  } else {
    // reducing_balance
    let ratePerInstallment = 0;
    if (collectionFrequency === 'daily') ratePerInstallment = (interestRate / 100) / 365;
    else if (collectionFrequency === 'weekly') ratePerInstallment = (interestRate / 100) / 52;
    else if (collectionFrequency === 'biweekly') ratePerInstallment = (interestRate / 100) / 26;
    else if (collectionFrequency === 'monthly') ratePerInstallment = (interestRate / 100) / 12;

    const r = ratePerInstallment;
    const n = installments;
    const emi = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    
    let balance = principal;
    let totalInterest = 0;

    for (let i = 1; i <= installments; i++) {
      const interestForPeriod = balance * r;
      const principalForPeriod = emi - interestForPeriod;
      totalInterest += interestForPeriod;
      balance = Math.max(0, balance - principalForPeriod);

      schedule.push({
        installmentNumber: i,
        principal: principalForPeriod,
        interest: interestForPeriod,
        total: emi,
        balance: balance
      });
    }

    const totalPayable = principal + totalInterest;

    return { totalPayable, totalInterest, emi, schedule };
  }
}
