export function periodsPerYear(frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'): number {
  switch (frequency) {
    case 'daily': return 365;
    case 'weekly': return 52;
    case 'biweekly': return 26;
    case 'monthly': return 12;
  }
}

export function calculateFlatInterest(
  principal: number,
  annualRate: number,
  tenure: number,
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
) {
  const years = tenure / periodsPerYear(frequency);
  const totalInterest = Math.round(principal * (annualRate / 100) * years);
  const totalPayable = principal + totalInterest;
  const installmentAmount = Math.round(totalPayable / tenure);

  return { totalInterest, totalPayable, installmentAmount };
}

export function calculateReducingBalanceEMI(
  principal: number,
  annualRate: number,
  tenure: number,
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
): number {
  const periodicRate = (annualRate / 100) / periodsPerYear(frequency);
  if (periodicRate === 0) {
    return Math.round(principal / tenure);
  }
  
  const factor = Math.pow(1 + periodicRate, tenure);
  const emi = principal * periodicRate * factor / (factor - 1);
  return Math.round(emi);
}
