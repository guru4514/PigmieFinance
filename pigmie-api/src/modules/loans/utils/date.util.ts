import { BadRequestException } from '@nestjs/common';
import { Frequency, periodsPerYear } from './interest.util';

export function addPeriods(
  startDate: string,
  periods: number,
  frequency: Frequency,
): string {
  periodsPerYear(frequency);
  const date = new Date(`${startDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== startDate ||
    !Number.isInteger(periods) ||
    periods < 0
  ) {
    throw new BadRequestException('Invalid schedule date or period count');
  }
  if (frequency === 'monthly') {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + periods);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(originalDay, lastDay));
  } else {
    const days = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 14;
    date.setUTCDate(date.getUTCDate() + periods * days);
  }
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) {
    throw new BadRequestException('Schedule date is out of range');
  }
  return date.toISOString().slice(0, 10);
}

/** Indian business date represented as UTC midnight for PostgreSQL DATE fields. */
export function businessDate(now = new Date()): Date {
  const shifted = new Date(now.getTime() + 330 * 60 * 1000);
  return new Date(`${shifted.toISOString().slice(0, 10)}T00:00:00.000Z`);
}
