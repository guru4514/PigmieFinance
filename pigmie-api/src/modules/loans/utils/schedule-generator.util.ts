import { periodsPerYear, calculateFlatInterest, calculateReducingBalanceEMI } from './interest.util';
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
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  startDate: string;
}

export function generateSchedule(params: GenerateScheduleParams): ScheduleRow[] {
  const { principal, interestType, annualRate, tenure, frequency, startDate } = params;
  const schedule: ScheduleRow[] = [];
  
  if (interestType === 'flat') {
    const { totalInterest, totalPayable } = calculateFlatInterest(principal, annualRate, tenure, frequency);
    const principalPerRow = Math.round(principal / tenure);
    const interestPerRow = Math.round(totalInterest / tenure);
    
    let remainingPrincipal = principal;
    let remainingInterest = totalInterest;
    
    for (let i = 1; i <= tenure; i++) {
      const isLast = i === tenure;
      const pComp = isLast ? remainingPrincipal : principalPerRow;
      const iComp = isLast ? remainingInterest : interestPerRow;
      
      schedule.push({
        installmentNumber: i,
        dueDate: addPeriods(startDate, i, frequency),
        principalComponent: pComp,
        interestComponent: iComp,
        dueAmount: pComp + iComp,
      });
      
      remainingPrincipal -= pComp;
      remainingInterest -= iComp;
    }
  } else {
    const emi = calculateReducingBalanceEMI(principal, annualRate, tenure, frequency);
    const periodicRate = (annualRate / 100) / periodsPerYear(frequency);
    let balance = principal;
    
    for (let i = 1; i <= tenure; i++) {
      const isLast = i === tenure;
      const interestComponent = Math.round(balance * periodicRate);
      
      let principalComponent;
      let dueAmount;
      
      if (isLast) {
        principalComponent = balance;
        dueAmount = principalComponent + interestComponent;
      } else {
        principalComponent = emi - interestComponent;
        dueAmount = emi;
      }
      
      schedule.push({
        installmentNumber: i,
        dueDate: addPeriods(startDate, i, frequency),
        principalComponent,
        interestComponent,
        dueAmount,
      });
      
      balance -= principalComponent;
    }
  }
  
  return schedule;
}

