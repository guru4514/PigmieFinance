export function addPeriods(
  startDate: string,
  periods: number,
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
): string {
  const date = new Date(startDate);
  
  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + periods);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + periods * 7);
      break;
    case 'biweekly':
      date.setUTCDate(date.getUTCDate() + periods * 14);
      break;
    case 'monthly':
      date.setUTCMonth(date.getUTCMonth() + periods);
      break;
  }
  
  return date.toISOString().split('T')[0];
}
