export interface ScheduleRowForAllocation {
  id: string;
  installmentNumber: number;
  dueAmount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
}

export interface AllocationResult {
  updatedRows: ScheduleRowForAllocation[];
  remainingOverpayment: number;
}

export function applyCollectionToSchedule(
  rows: ScheduleRowForAllocation[],
  amount: number,
  today: string,
): AllocationResult {
  let remainingAmount = amount;
  
  const sortedRows = [...rows].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const updatedRows: ScheduleRowForAllocation[] = [];
  
  for (const row of sortedRows) {
    if (['pending', 'partially_paid', 'overdue'].includes(row.status)) {
      const remainingDue = row.dueAmount - row.paidAmount;
      
      if (remainingDue > 0 && remainingAmount > 0) {
        const allocatedAmount = Math.min(remainingDue, remainingAmount);
        
        updatedRows.push({
          ...row,
          paidAmount: row.paidAmount + allocatedAmount,
          status: row.paidAmount + allocatedAmount >= row.dueAmount ? 'paid' : 'partially_paid',
        });
        
        remainingAmount -= allocatedAmount;
      }
    }
  }
  
  return {
    updatedRows,
    remainingOverpayment: remainingAmount,
  };
}
