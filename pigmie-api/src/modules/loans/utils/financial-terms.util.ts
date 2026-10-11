import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** NULL is explicitly historical evidence, never inferred from a current product. */
export function assertSupportedFinancialTerms(
  value: Prisma.JsonValue | undefined,
): void {
  if (value === null || value === undefined) return;
  if (
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    value.currency !== 'INR' ||
    value.businessTimezone !== 'Asia/Kolkata' ||
    value.paymentAllocation !==
      'oldest_installment_proportional_components_v1' ||
    value.earlyClosure !== 'unpaid_principal_daily_accrued_interest_v1' ||
    value.rounding !== 'INR_two_decimal_half_up' ||
    value.lateFee !== '0.00' ||
    value.processingFee !== '0.00' ||
    value.preClosurePenalty !== '0.00'
  ) {
    throw new BadRequestException(
      'Loan financial contract requires reconciliation before this operation',
    );
  }
}
