export function calculateLateFee(
  dueAmount: number,
  lateFeeType: 'flat' | 'percentage',
  lateFeeValue: number,
): number {
  if (lateFeeType === 'flat') {
    return lateFeeValue;
  }
  
  return Math.round(dueAmount * (lateFeeValue / 100));
}
